import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { brotliCompressSync, brotliDecompressSync, constants, gzipSync, gunzipSync } from "node:zlib";

import { create_request_handler } from "./app.mjs";

async function fixture(t, options = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "panio-http-cache-"));
  mkdirSync(resolve(root, "assets"));
  const script = "const title = '练琴簿';\n".repeat(1000);
  writeFileSync(resolve(root, "assets/app.js"), script);
  writeFileSync(resolve(root, "index.html"), "<html>练琴簿</html>");
  writeFileSync(resolve(root, "score.musicxml"), "<score>original</score>");
  const catalog = {
    materials: [{
      id: "test-book",
      segments: [{ id: "lesson-1", text: "教材文字".repeat(1000) }, { id: "lesson-2" }],
    }],
  };
  writeFileSync(resolve(root, "catalog.json"), JSON.stringify(catalog));
  writeFileSync(resolve(root, "jianpu-catalog.json"), JSON.stringify(catalog));
  const deletions = [];
  const server = createServer(create_request_handler({
    repository: {
      list_material_deletions: () => deletions,
      list_published_material_assets: () => [],
      list_score_calibrations: () => [],
    },
    static_root: root,
    uploads_root: root,
    catalog_path: resolve(root, "catalog.json"),
    logger: () => {},
    enforce_presence: false,
    ...options,
  }));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const read = (path, headers = {}, method = "GET") => new Promise((done, reject) => {
    const req = request({
      host: "127.0.0.1", port: server.address().port, path, method, headers,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => done({
        status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks),
      }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
  return { root, script, deletions, read };
}

test("静态脚本按客户端能力压缩且解压后内容完全一致", async (t) => {
  const { read, script } = await fixture(t);
  for (const [encoding, decode] of [["gzip", gunzipSync], ["br", brotliDecompressSync]]) {
    const result = await read("/assets/app.js", { "Accept-Encoding": encoding });
    assert.equal(result.status, 200);
    assert.equal(result.headers["content-encoding"], encoding);
    assert.equal(result.headers.vary, "Accept-Encoding");
    assert.match(result.headers["cache-control"], /immutable/);
    assert.equal(decode(result.body).toString(), script);
    assert.ok(result.body.length < Buffer.byteLength(script) / 10);
  }
});

test("压缩协商尊重 q=0、质量权重和 HEAD 语义", async (t) => {
  const { read, script } = await fixture(t);
  const identity = await read("/assets/app.js", { "Accept-Encoding": "br;q=0, gzip;q=0, *;q=1" });
  assert.equal(identity.headers["content-encoding"], undefined);
  assert.equal(identity.body.toString(), script);
  assert.equal(Number(identity.headers["content-length"]), Buffer.byteLength(script));
  const preferred = await read("/assets/app.js", { "Accept-Encoding": "br;q=0.3, gzip;q=0.8" });
  assert.equal(preferred.headers["content-encoding"], "gzip");
  const head = await read("/assets/app.js", { "Accept-Encoding": "gzip" }, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers["content-encoding"], "gzip");
  assert.equal(head.body.length, 0);
});

test("构建时压缩产物直接复用，保持解码、协商、HEAD 和 304 语义", async (t) => {
  const { read, root, script } = await fixture(t);
  for (const [encoding, suffix, compressed, decode] of [
    ["br", "br", brotliCompressSync(script, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), brotliDecompressSync],
    ["gzip", "gz", gzipSync(script, { level: 9 }), gunzipSync],
  ]) {
    const digest = createHash("sha256").update(script).digest("hex");
    writeFileSync(resolve(root, `assets/app.js.${digest}.${suffix}`), compressed);
    const result = await read("/assets/app.js", { "Accept-Encoding": encoding });
    assert.deepEqual(result.body, compressed);
    assert.equal(decode(result.body).toString(), script);
    assert.equal(result.headers["content-encoding"], encoding);
    assert.equal(Number(result.headers["content-length"]), compressed.length);
    const head = await read("/assets/app.js", { "Accept-Encoding": encoding }, "HEAD");
    assert.equal(head.headers["content-length"], result.headers["content-length"]);
    assert.equal(head.body.length, 0);
    const cached = await read("/assets/app.js", {
      "Accept-Encoding": encoding, "If-None-Match": result.headers.etag,
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.body.length, 0);
  }
  const identity = await read("/assets/app.js", { "Accept-Encoding": "br;q=0,gzip;q=0" });
  assert.equal(identity.headers["content-encoding"], undefined);
  assert.equal(identity.body.toString(), script);
  const preferred = await read("/assets/app.js", { "Accept-Encoding": "br;q=0.2,gzip;q=0.9" });
  assert.equal(preferred.headers["content-encoding"], "gzip");
});

test("同 URL 的源文件更新后忽略旧预压缩产物，谱面不使用静态旁文件", async (t) => {
  const { read, root, script } = await fixture(t);
  const digest = createHash("sha256").update(script).digest("hex");
  const sidecar = resolve(root, `assets/app.js.${digest}.br`);
  writeFileSync(sidecar, brotliCompressSync(script));
  const initial = await read("/assets/app.js", { "Accept-Encoding": "br" });
  const updated = script.replaceAll("练琴簿", "新乐谱");
  writeFileSync(resolve(root, "assets/app.js"), updated);
  const changed = await read("/assets/app.js", {
    "Accept-Encoding": "br", "If-None-Match": initial.headers.etag,
  });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.etag, initial.headers.etag);
  assert.equal(brotliDecompressSync(changed.body).toString(), updated);
  writeFileSync(resolve(root, "score.musicxml.br"), brotliCompressSync("stale score"));
  assert.equal((await read("/score.musicxml", { "Accept-Encoding": "br" })).body.toString(), "<score>original</score>");
});

test("教材目录支持压缩和 304，删除片段后旧 ETag 失效", async (t) => {
  const { read, deletions } = await fixture(t);
  for (const path of ["/api/v1/content/materials", "/api/v1/content/jianpu-materials"]) {
    const initial = await read(path, { "Accept-Encoding": "gzip" });
    assert.equal(initial.headers["content-encoding"], "gzip");
    assert.equal(initial.headers["cache-control"], "public, no-cache");
    assert.equal(JSON.parse(gunzipSync(initial.body)).materials[0].segments.length, 2);
    const cached = await read(path, { "If-None-Match": `"another", ${initial.headers.etag}` });
    assert.equal(cached.status, 304);
    assert.equal(cached.body.length, 0);
    deletions.push({ material_id: "test-book", segment_id: "lesson-1" });
    const changed = await read(path, { "If-None-Match": initial.headers.etag });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.etag, initial.headers.etag);
    assert.deepEqual(JSON.parse(changed.body).materials[0].segments.map((s) => s.id), ["lesson-2"]);
    deletions.length = 0;
  }
});

test("谱面同 URL 更新后重新下载，HTML 和谱面要求重新验证", async (t) => {
  const { read, root } = await fixture(t);
  const initial = await read("/score.musicxml");
  assert.equal(initial.headers["cache-control"], "public, no-cache");
  const cached = await read("/score.musicxml", { "If-None-Match": initial.headers.etag });
  assert.equal(cached.status, 304);
  writeFileSync(resolve(root, "score.musicxml"), "<score>updated notes</score>");
  const changed = await read("/score.musicxml", { "If-None-Match": initial.headers.etag });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.toString(), "<score>updated notes</score>");
  assert.notEqual(changed.headers.etag, initial.headers.etag);
  assert.equal((await read("/")).headers["cache-control"], "public, no-cache");
});

test("账号及管理接口不缓存，静态资源不消耗 API 限流额度", async (t) => {
  const { read } = await fixture(t, { global_rate_limit: 2 });
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await read("/assets/app.js")).status, 200);
  }
  for (const path of ["/api/v1/auth/me", "/api/v1/admin/users"]) {
    const response = await read(path);
    assert.ok([401, 403].includes(response.status));
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers.etag, undefined);
  }
  assert.equal((await read("/api/v1/health")).status, 200);
});
