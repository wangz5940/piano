#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer as create_net_server } from "node:net";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

class Cdp_client {
  constructor(web_socket_url) {
    this.next_id = 1;
    this.pending = new Map();
    this.socket = new WebSocket(web_socket_url);
    this.open_promise = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve);
      this.socket.addEventListener("error", reject);
    });
    this.socket.addEventListener("message", (event) => this.handle_message(event));
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Chrome DevTools 连接已关闭"));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}, timeout_ms = 30_000) {
    await this.open_promise;
    const id = this.next_id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 调用超时：${method}`));
      }, timeout_ms);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  handle_message(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!message.id) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result || {});
    }
  }

  close() {
    this.socket.close();
  }
}

const project_root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const default_input_path = resolve(project_root, "data/jianpu-authorized-urls.txt");
const default_output_dir = resolve(project_root, "data/jianpu-imported");
const default_scroll_selector = process.env.JIANPU_SCROLL_SELECTOR || undefined;

const options = parse_arguments(process.argv.slice(2));

if (options.help) {
  print_help();
  process.exit(0);
}

const input_path = resolve(options.input || default_input_path);
const output_dir = resolve(options.output || default_output_dir);
const limit = parse_positive_integer(options.limit, 100);
const max_pages = parse_positive_integer(options.max_pages, 100);
const settle_ms = parse_nonnegative_integer(options.settle_ms, 350);
const delay_ms = parse_nonnegative_integer(options.delay_ms, 1_500);
const overlap = parse_fraction(options.overlap, 0.12);
const chrome_path = options.chrome || find_chrome_binary();
const scroll_selector = options.selector || default_scroll_selector;
const urls = load_url_list(input_path).slice(0, limit);

if (urls.length === 0) {
  throw new Error(`URL 清单为空：${input_path}`);
}

const browser = await launch_chrome(chrome_path);
const client = new Cdp_client(browser.web_socket_url);

try {
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  if (options.inspect_only) {
    for (const [index, url] of urls.entries()) {
      try {
        await navigate_to(client, url, options.timeout_ms);
        const inspection = await inspect_page(client, scroll_selector);
        console.log(`\n[${index + 1}/${urls.length}] ${url}`);
        console.log(`标题：${inspection.title || "未读取到标题"}`);
        console.log(JSON.stringify(inspection.candidates, null, 2));
      } catch (error) {
        console.error(`[跳过] ${url}: ${error_message(error)}`);
      }
      if (index < urls.length - 1) {
        await sleep(delay_ms);
      }
    }
    process.exitCode = 0;
  } else {
    mkdirSync(output_dir, { recursive: true });
    const results = [];

    for (const [index, url] of urls.entries()) {
      try {
        const result = await capture_piece(client, {
          url,
          piece_index: index + 1,
          output_dir,
          scroll_selector,
          max_pages,
          settle_ms,
          overlap,
          timeout_ms: options.timeout_ms,
        });
        results.push(result);
        console.log(
          `[完成 ${index + 1}/${urls.length}] ${result.title || url}：${result.pages.length} 张`,
        );
      } catch (error) {
        const failed = { url, error: error_message(error) };
        results.push(failed);
        console.error(`[失败 ${index + 1}/${urls.length}] ${url}: ${failed.error}`);
      }
      if (index < urls.length - 1) {
        await sleep(delay_ms);
      }
    }

    const batch_manifest_path = join(output_dir, "batch-manifest.json");
    write_json(batch_manifest_path, {
      generated_at: new Date().toISOString(),
      input_path,
      limit,
      success_count: results.filter((item) => !item.error).length,
      failure_count: results.filter((item) => item.error).length,
      results,
    });
    console.log(`\n批处理清单：${batch_manifest_path}`);

    if (results.some((item) => item.error)) {
      process.exitCode = 1;
    }
  }
} finally {
  client.close();
  browser.close();
}

async function capture_piece(client, {
  url,
  piece_index,
  output_dir,
  scroll_selector,
  max_pages,
  settle_ms,
  overlap,
  timeout_ms,
}) {
  await navigate_to(client, url, timeout_ms);
  const inspection = await inspect_page(client, scroll_selector);
  const title = inspection.title || new URL(url).pathname || new URL(url).hostname;
  const piece_name = `${String(piece_index).padStart(3, "0")}-${sanitize_filename(title)}`;
  const piece_dir = join(output_dir, piece_name);
  mkdirSync(piece_dir, { recursive: true });

  if (inspection.capture_mode === "wheel") {
    const activation = await click_score_play_button(client, settle_ms);
    return capture_wheel_piece(client, {
      url,
      title,
      piece_name,
      piece_dir,
      inspection,
      scroll_selector,
      max_pages,
      settle_ms,
      overlap,
      activation,
    });
  }

  const pages = [];
  const seen_scroll_positions = new Set();
  let page_number = 0;

  while (page_number < max_pages) {
    await ensure_target_visible(client);
    const state = await read_target_state(client);
    const scroll_position = Math.round(state.scroll_top);
    if (seen_scroll_positions.has(scroll_position)) {
      break;
    }
    seen_scroll_positions.add(scroll_position);

    await sleep(settle_ms);
    await ensure_target_visible(client);
    const settled_state = await read_target_state(client);
    const clip = create_viewport_clip(settled_state);
    if (!clip) {
      throw new Error("简谱容器没有可截图的可视区域");
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      clip,
    });
    page_number += 1;
    const file_name = `page-${String(page_number).padStart(3, "0")}.png`;
    writeFileSync(join(piece_dir, file_name), Buffer.from(screenshot.data, "base64"));
    pages.push({
      file: file_name,
      scroll_top: settled_state.scroll_top,
      scroll_height: settled_state.scroll_height,
      client_height: settled_state.client_height,
      width: clip.width,
      height: clip.height,
    });

    const current_max_scroll = Math.max(
      0,
      settled_state.scroll_height - settled_state.client_height,
    );
    if (settled_state.scroll_top >= current_max_scroll - 2) {
      break;
    }

    const step = Math.max(1, Math.floor(settled_state.client_height * (1 - overlap)));
    const next_scroll_top = Math.min(
      current_max_scroll,
      Math.ceil(settled_state.scroll_top + step),
    );
    if (next_scroll_top <= settled_state.scroll_top) {
      break;
    }
    await set_target_scroll_top(client, next_scroll_top);
  }

  if (page_number >= max_pages) {
    console.warn(`[提示] ${url} 达到 --max-pages=${max_pages}，可能仍有未截图内容`);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    source_url: url,
    title,
    scroll_selector: scroll_selector || inspection.selected_selector,
    target: inspection.selected_target,
    pages,
  };
  const manifest_path = join(piece_dir, "manifest.json");
  write_json(manifest_path, manifest);
  return {
    source_url: url,
    title,
    directory: piece_name,
    manifest: join(piece_name, basename(manifest_path)),
    pages,
  };
}

async function capture_wheel_piece(client, {
  url,
  title,
  piece_name,
  piece_dir,
  inspection,
  scroll_selector,
  max_pages,
  settle_ms,
  overlap,
  activation,
}) {
  const frame_context_id = await create_frame_context(client, inspection.selected_target.src);
  await ensure_target_visible(client);
  const pages = [];
  const seen_scroll_positions = new Set();

  for (let page_number = 1; page_number <= max_pages; page_number += 1) {
    await sleep(settle_ms);
    const frame_state = await read_frame_state(client, frame_context_id);
    const viewport_state = await read_target_state(client);
    const scroll_position = Math.round(frame_state.scroll_top);
    if (seen_scroll_positions.has(scroll_position)) {
      break;
    }
    seen_scroll_positions.add(scroll_position);

    const clip = create_viewport_clip(viewport_state);
    if (!clip) {
      throw new Error("简谱 iframe 没有可截图的可视区域");
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      clip,
    });

    const file_name = `page-${String(page_number).padStart(3, "0")}.png`;
    writeFileSync(join(piece_dir, file_name), Buffer.from(screenshot.data, "base64"));
    pages.push({
      file: file_name,
      scroll_top: frame_state.scroll_top,
      scroll_height: frame_state.scroll_height,
      client_height: frame_state.client_height,
      width: clip.width,
      height: clip.height,
    });

    const current_max_scroll = Math.max(
      0,
      frame_state.scroll_height - frame_state.client_height,
    );
    if (frame_state.scroll_top >= current_max_scroll - 2) {
      break;
    }

    const step = Math.max(1, Math.floor(frame_state.client_height * (1 - overlap)));
    const next_scroll_top = Math.min(
      current_max_scroll,
      Math.ceil(frame_state.scroll_top + step),
    );
    if (next_scroll_top <= frame_state.scroll_top) {
      break;
    }
    await set_frame_scroll_top(client, frame_context_id, next_scroll_top);
  }

  if (pages.length >= max_pages) {
    console.warn(`[提示] ${url} 达到 --max-pages=${max_pages}，可能仍有未截图内容`);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    source_url: url,
    title,
    capture_mode: "frame-scroll",
    activation,
    scroll_selector: scroll_selector || inspection.selected_selector,
    target: inspection.selected_target,
    pages,
  };
  const manifest_path = join(piece_dir, "manifest.json");
  write_json(manifest_path, manifest);
  return {
    source_url: url,
    title,
    directory: piece_name,
    manifest: join(piece_name, basename(manifest_path)),
    pages,
  };
}

async function click_score_play_button(client, settle_ms) {
  await ensure_target_visible(client);
  const state = await read_target_state(client);
  const x = state.rect.left + state.rect.width / 2;
  const y = state.rect.top + state.rect.height / 2;
  const event = {
    x,
    y,
    button: "left",
    clickCount: 1,
  };
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...event,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...event,
  });
  await sleep(Math.max(settle_ms, 500));
  return {
    clicked: true,
    x: Math.round(x),
    y: Math.round(y),
    wait_ms: Math.max(settle_ms, 500),
  };
}

async function inspect_page(client, scroll_selector) {
  return evaluate(client, `(() => {
    const requested_selector = ${JSON.stringify(scroll_selector || "")};
    const describe_element = (element) => {
      if (element === document.scrollingElement) {
        return "document";
      }
      if (element.id && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(element.id)) {
        return "#" + element.id;
      }
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.classList.length > 0) {
          const class_name = [...current.classList]
            .find((name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name));
          if (class_name) {
            part += "." + class_name;
          }
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children]
            .filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) {
            part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
          }
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    };
    const element_info = (element, score = 0) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector: describe_element(element),
        tag_name: element.tagName.toLowerCase(),
        src: element.tagName === "IFRAME" ? element.src : undefined,
        class_name: String(element.className || "").slice(0, 160),
        overflow_y: style.overflowY,
        scroll_top: element.scrollTop,
        scroll_height: element.scrollHeight,
        client_height: element.clientHeight,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        score: Math.round(score),
      };
    };
    const is_visible = (rect) =>
      rect.width >= 180 &&
      rect.height >= 120 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight;
    const is_scrollable = (element) => {
      const style = getComputedStyle(element);
      return (
        element.scrollHeight > element.clientHeight + 8 &&
        (style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          element === document.scrollingElement)
      );
    };

    let selected;
    let capture_mode = "scroll";
    if (requested_selector === "document") {
      selected = document.scrollingElement;
    } else if (requested_selector) {
      selected = document.querySelector(requested_selector);
      if (!selected) {
        throw new Error("找不到滚动容器：" + requested_selector);
      }
      capture_mode = selected.tagName === "IFRAME" ? "wheel" : "scroll";
    } else {
      const candidates = [...document.querySelectorAll("*")]
        .filter((element) => element !== document.body && element !== document.documentElement)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const ratio = element.clientHeight > 0
            ? element.scrollHeight / element.clientHeight
            : 0;
          const score = rect.width * rect.height * Math.min(ratio, 8);
          return { element, rect, score };
        })
        .filter(({ element, rect }) => is_scrollable(element) && is_visible(rect))
        .sort((left, right) => right.score - left.score);
      const frame_candidates = [...document.querySelectorAll("iframe")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            element,
            rect,
            score: rect.width * rect.height,
          };
        })
        .filter(({ rect }) => is_visible(rect))
        .sort((left, right) => right.score - left.score);
      selected = candidates[0]?.element
        || frame_candidates[0]?.element
        || document.scrollingElement;
      capture_mode = candidates[0] ? "scroll" : frame_candidates[0] ? "wheel" : "scroll";
      window.__panio_jianpu_candidates = candidates
        .slice(0, 20)
        .map(({ element, score }) => element_info(element, score))
        .concat(frame_candidates.slice(0, 10).map(({ element, score }) => element_info(element, score)));
    }

    if (!selected) {
      throw new Error("页面没有可用的滚动容器");
    }
    window.__panio_jianpu_target = selected;
    window.__panio_jianpu_capture_mode = capture_mode;
    const selected_info = element_info(selected);
    return {
      title: document.title.trim(),
      selected_selector: describe_element(selected),
      selected_target: selected_info,
      candidates: window.__panio_jianpu_candidates || [selected_info],
      capture_mode,
    };
  })()`);
}

async function read_target_state(client) {
  return evaluate(client, `(() => {
    const element = window.__panio_jianpu_target || document.scrollingElement;
    const is_document = element === document.scrollingElement;
    const rect = element.getBoundingClientRect();
    return {
      is_document,
      scroll_top: is_document ? window.scrollY : element.scrollTop,
      scroll_height: is_document
        ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
        : element.scrollHeight,
      client_height: is_document ? window.innerHeight : element.clientHeight,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    };
  })()`);
}

async function ensure_target_visible(client) {
  await evaluate(client, `(() => {
    const element = window.__panio_jianpu_target || document.scrollingElement;
    if (element !== document.scrollingElement) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }
    return true;
  })()`);
}

async function set_target_scroll_top(client, scroll_top) {
  await evaluate(client, `(() => {
    const element = window.__panio_jianpu_target || document.scrollingElement;
    const next_scroll_top = ${Math.max(0, Math.floor(scroll_top))};
    if (element === document.scrollingElement) {
      window.scrollTo(0, next_scroll_top);
    } else {
      element.scrollTop = next_scroll_top;
    }
    return true;
  })()`);
}

async function navigate_to(client, url, timeout_ms = 30_000) {
  await client.send("Page.navigate", { url });
  await evaluate(client, `new Promise((resolve) => {
    const started_at = Date.now();
    const wait_for_ready = () => {
      if (
        document.readyState === "complete" ||
        document.readyState === "interactive" ||
        Date.now() - started_at > ${timeout_ms}
      ) {
        resolve(true);
        return;
      }
      setTimeout(wait_for_ready, 100);
    };
    wait_for_ready();
  })`, timeout_ms + 5_000);
  await sleep(800);
}

function create_viewport_clip(state) {
  const left = Math.max(0, state.rect.left);
  const top = Math.max(0, state.rect.top);
  const right = Math.min(state.viewport_width, state.rect.left + state.rect.width);
  const bottom = Math.min(state.viewport_height, state.rect.top + state.rect.height);
  const width = Math.floor(right - left);
  const height = Math.floor(bottom - top);
  if (width < 2 || height < 2) {
    return undefined;
  }
  return {
    x: Math.floor(left),
    y: Math.floor(top),
    width,
    height,
    scale: 1,
  };
}

async function evaluate(client, expression, timeout_ms = 30_000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, timeout_ms);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || "页面脚本执行失败";
    throw new Error(description);
  }
  return result.result?.value;
}

async function evaluate_in_context(client, expression, context_id, timeout_ms = 30_000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    contextId: context_id,
    returnByValue: true,
    userGesture: true,
  }, timeout_ms);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || "iframe 页面脚本执行失败";
    throw new Error(description);
  }
  return result.result?.value;
}

async function create_frame_context(client, frame_src) {
  const frame_tree = await client.send("Page.getFrameTree");
  const frames = flatten_frame_tree(frame_tree.frameTree);
  const page_url = await evaluate(client, "location.href");
  const expected_url = frame_src ? new URL(frame_src, page_url).href : "";
  const frame = frames.find((item) =>
    item.frame.parentId &&
    expected_url &&
    (item.frame.url === expected_url || item.frame.url.startsWith(`${expected_url}#`))
  ) || frames.find((item) => item.frame.parentId);
  if (!frame) {
    throw new Error("找不到简谱 iframe 的 CDP frame");
  }
  const world = await client.send("Page.createIsolatedWorld", {
    frameId: frame.frame.id,
    worldName: "panio-jianpu-capture",
    grantUniveralAccess: true,
  });
  return world.executionContextId;
}

function flatten_frame_tree(tree) {
  return [
    tree,
    ...(tree.childFrames || []).flatMap((child) => flatten_frame_tree(child)),
  ];
}

async function read_frame_state(client, context_id) {
  return evaluate_in_context(client, `(() => {
    const scroll_element = document.scrollingElement;
    return {
      scroll_top: window.scrollY || scroll_element?.scrollTop || 0,
      scroll_height: Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
      ),
      client_height: window.innerHeight || document.documentElement?.clientHeight || 0,
    };
  })()`, context_id);
}

async function set_frame_scroll_top(client, context_id, scroll_top) {
  return evaluate_in_context(client, `(() => {
    window.scrollTo(0, ${Math.max(0, Math.floor(scroll_top))});
    return true;
  })()`, context_id);
}

async function launch_chrome(chrome_path) {
  if (!existsSync(chrome_path)) {
    throw new Error(`找不到 Chrome/Chromium：${chrome_path}，可通过 --chrome 或 CHROME_BIN 指定`);
  }
  const port = await find_free_port();
  const user_data_dir = mkdtempSync(join(tmpdir(), "panio-jianpu-chrome-"));
  const chrome_sandbox_flags = process.env.PANIO_CHROME_NO_SANDBOX === "1"
    ? ["--no-sandbox", "--disable-setuid-sandbox"]
    : [];
  const child = spawn(chrome_path, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-crash-reporter",
    "--disable-breakpad",
    "--disable-dev-shm-usage",
    ...chrome_sandbox_flags,
    "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${user_data_dir}`,
    "--window-size=1440,1000",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    const base_url = `http://127.0.0.1:${port}`;
    await wait_for_json(`${base_url}/json/version`, child);
    return {
      child,
      user_data_dir,
      web_socket_url: await find_page_web_socket(base_url),
      close() {
        child.kill("SIGTERM");
        cleanup_user_data_dir(user_data_dir);
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    cleanup_user_data_dir(user_data_dir);
    throw error;
  }
}

function cleanup_user_data_dir(user_data_dir) {
  try {
    rmSync(user_data_dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch (error) {
    console.warn(`[提示] Chrome 临时目录稍后再清理：${error_message(error)}`);
  }
}

async function find_page_web_socket(base_url) {
  const response = await fetch(`${base_url}/json/list`);
  const pages = await response.json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("Chrome 没有暴露可用页面");
  }
  return page.webSocketDebuggerUrl;
}

async function wait_for_json(url, child, timeout_ms = 15_000) {
  const started_at = Date.now();
  while (Date.now() - started_at < timeout_ms) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome 启动失败，退出码：${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Chrome 还没有开始监听端口。
    }
    await sleep(150);
  }
  throw new Error(`等待 Chrome DevTools 端点超时：${url}`);
}

async function find_free_port() {
  const server = create_net_server();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function find_chrome_binary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const binary = candidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error("未找到 Chrome/Chromium，请安装浏览器或设置 CHROME_BIN");
  }
  return binary;
}

function load_url_list(file_path) {
  if (!existsSync(file_path)) {
    throw new Error(
      `找不到 URL 清单：${file_path}\n请复制 scripts/jianpu-urls.example.txt，填入已获授权的 URL 后再运行。`,
    );
  }
  const seen = new Set();
  return readFileSync(file_path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line, index) => {
      let parsed;
      try {
        parsed = new URL(line);
      } catch {
        throw new Error(`URL 清单第 ${index + 1} 行不是有效 URL：${line}`);
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`URL 清单第 ${index + 1} 行必须使用 HTTP(S)：${line}`);
      }
      if (seen.has(parsed.href)) {
        return false;
      }
      seen.add(parsed.href);
      return true;
    });
}

function parse_arguments(argv) {
  const parsed = {};
  const value_options = new Set([
    "input",
    "output",
    "limit",
    "max-pages",
    "settle-ms",
    "delay-ms",
    "overlap",
    "selector",
    "chrome",
    "timeout-ms",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (argument === "--inspect-only") {
      parsed.inspect_only = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`不支持的参数：${argument}`);
    }
    const [raw_name, inline_value] = argument.slice(2).split("=", 2);
    if (!value_options.has(raw_name)) {
      throw new Error(`不支持的参数：--${raw_name}`);
    }
    const value = inline_value ?? argv[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 --${raw_name} 缺少值`);
    }
    parsed[raw_name.replaceAll("-", "_")] = value;
  }
  return parsed;
}

function parse_positive_integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parse_nonnegative_integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parse_fraction(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 1 ? parsed : fallback;
}

function sanitize_filename(value) {
  const sanitized = String(value)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return sanitized || "jianpu";
}

function write_json(file_path, value) {
  mkdirSync(dirname(file_path), { recursive: true });
  writeFileSync(file_path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function error_message(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function print_help() {
  console.log(`用法：
  npm run capture:jianpu -- --input data/jianpu-authorized-urls.txt

参数：
  --input <file>       URL 清单，默认 data/jianpu-authorized-urls.txt
  --output <dir>       PNG 输出目录，默认 data/jianpu-imported
  --limit <n>          最多处理多少个 URL，默认 100
  --max-pages <n>      单个 URL 最多截图页数，默认 100
  --selector <css>     指定简谱滚动容器；也可用 JIANPU_SCROLL_SELECTOR
  --overlap <0-1>      相邻截图重叠比例，默认 0.12
  --settle-ms <n>      每次滚动后的等待时间，默认 350
  --delay-ms <n>       URL 之间的等待时间，默认 1500
  --timeout-ms <n>     页面准备超时时间，默认 30000
  --chrome <path>      Chrome/Chromium 可执行文件路径
  --inspect-only       只打开页面并打印滚动容器候选，不保存截图
  --help               显示帮助

说明：
  1. 仅把你拥有或已获授权的 URL 写入清单。
  2. iframe 简谱会先点击中央播放键并等待遮罩隐藏，再开始截图。
  3. 默认自动选择最大的可视滚动容器；不准确时先用 --inspect-only。
  4. 该工具不绕过登录、验证码、付费墙或站点访问限制。
  5. 受限容器若无法启动 Chrome，可显式设置 PANIO_CHROME_NO_SANDBOX=1。`);
}
