import { randomUUID } from "node:crypto";
import busboy from "busboy";
import sharp from "sharp";
import { read_json_body, validation_error } from "./validation.mjs";

export const feedback_image_limit = 5 * 1024 * 1024;
const feedback_body_limit = 4 * feedback_image_limit + 64 * 1024;
const accepted_types = new Set(["image/jpeg", "image/png", "image/webp"]);
sharp.cache({ memory: 16, files: 0, items: 16 });
sharp.concurrency(1);

/** Private images share SQLite transactions, account deletion and the existing backup lifecycle. */
export function create_feedback_handler(database, {
  storage_limit = 500 * 1024 * 1024,
  user_daily_limit = 5,
  daily_limit = 50,
} = {}) {
  let uploading = false;
  const image_metadata = database.prepare(`
    SELECT id, size_bytes FROM feedback_images WHERE feedback_id=? ORDER BY position
  `);
  const get_entry = database.prepare(`
    SELECT f.*, u.display_name FROM feedback f JOIN users u ON u.id=f.user_id WHERE f.id=?
  `);
  const serialize = (row) => ({
    ...row,
    images: image_metadata.all(row.id).map((image) => ({
      ...image, url: `/api/v1/feedback/${row.id}/images/${image.id}`,
    })),
  });
  const require_entry = (id, user) => {
    const entry = get_entry.get(id);
    if (!entry || (user.role !== "admin" && entry.user_id !== user.id)) {
      throw new validation_error("反馈不存在。", 404, "not_found");
    }
    return entry;
  };
  const check_capacity = (user_id, image_bytes = 0) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = database.prepare(`
      SELECT count(*) AS total, coalesce(sum(user_id=?),0) AS own
      FROM feedback WHERE created_at > ?
    `).get(user_id, since);
    if (recent.own >= user_daily_limit || recent.total >= daily_limit) {
      throw new validation_error("今日反馈提交较多，请明天再试。", 429, "feedback_daily_limit");
    }
    const size = database.prepare("SELECT coalesce(sum(size_bytes),0) AS size FROM feedback_images").get().size;
    const count = database.prepare("SELECT count(*) AS count FROM feedback").get().count;
    if (count >= 10_000 || (image_bytes > 0 && size + image_bytes > storage_limit)) {
      throw new validation_error("反馈存储空间已满，请稍后重试。", 503, "feedback_storage_full");
    }
  };

  return async ({ request, response, url, user, send_json }) => {
    const { pathname } = url;
    if (pathname !== "/api/v1/feedback" && !pathname.startsWith("/api/v1/feedback/")) return false;
    if (!user) throw new validation_error("请先登录。", 401, "authentication_required");
    const method = request.method ?? "GET";
    if (pathname === "/api/v1/feedback" && method === "GET") {
      const offset = Math.min(10_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0));
      const all = url.searchParams.get("scope") === "all";
      if (all && user.role !== "admin") throw new validation_error("没有管理权限。", 403);
      const rows = database.prepare(`
        SELECT f.*, u.display_name FROM feedback f JOIN users u ON u.id=f.user_id
        ${all ? "" : "WHERE f.user_id=?"}
        ORDER BY f.created_at DESC, f.id DESC LIMIT 21 OFFSET ?
      `).all(...(all ? [offset] : [user.id, offset]));
      send_json(response, 200, {
        feedback: rows.slice(0, 20).map(serialize),
        next_offset: rows.length > 20 ? offset + 20 : null,
      });
      return true;
    }
    if (pathname === "/api/v1/feedback" && method === "POST") {
      check_capacity(user.id);
      if (uploading) {
        response.setHeader("Retry-After", "5");
        throw new validation_error("图片上传服务繁忙，请稍后重试。", 429, "feedback_busy");
      }
      uploading = true;
      try {
        const input = await read_feedback(request);
        // Decode one image at a time; never trust filename, MIME type or an SVG upload.
        const images = [];
        for (const file of input.files) images.push(await sanitize_image(file));
        check_capacity(user.id, images.reduce((sum, data) => sum + data.length, 0));
        const id = randomUUID();
        const now = new Date().toISOString();
        database.exec("BEGIN IMMEDIATE");
        try {
          // The account may have been deleted while its upload was in progress.
          if (!database.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(user.id)) {
            throw new validation_error("账号已失效，请重新登录。", 401);
          }
          database.prepare(`
            INSERT INTO feedback(id,user_id,message,created_at,updated_at) VALUES (?,?,?,?,?)
          `).run(id, user.id, input.message, now, now);
          const insert = database.prepare(`
            INSERT INTO feedback_images(id,feedback_id,data,size_bytes,position) VALUES (?,?,?,?,?)
          `);
          images.forEach((data, position) => insert.run(randomUUID(), id, data, data.length, position));
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
        send_json(response, 201, { feedback: serialize(get_entry.get(id)) });
      } catch (error) {
        // Drain bounded uploads without closing the socket mid-write, so clients can read
        // the validation response. Unbounded/oversized bodies must not keep streaming.
        const content_length = Number(request.headers["content-length"]);
        if (!request.complete && (!Number.isFinite(content_length) ||
          content_length <= 0 || content_length > feedback_body_limit)) {
          response.setHeader("Connection", "close");
        }
        request.resume();
        throw error;
      } finally {
        uploading = false;
      }
      return true;
    }
    const image_match = pathname.match(/^\/api\/v1\/feedback\/([a-f0-9-]+)\/images\/([a-f0-9-]+)$/);
    if (image_match && (method === "GET" || method === "HEAD")) {
      require_entry(image_match[1], user);
      const image = database.prepare("SELECT data,size_bytes FROM feedback_images WHERE id=? AND feedback_id=?")
        .get(image_match[2], image_match[1]);
      if (!image) throw new validation_error("图片不存在。", 404, "not_found");
      response.setHeader("Content-Type", "image/webp");
      response.setHeader("Content-Length", image.size_bytes);
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("Content-Disposition", 'inline; filename="feedback.webp"');
      response.end(method === "HEAD" ? undefined : image.data);
      return true;
    }
    const entry_match = pathname.match(/^\/api\/v1\/feedback\/([a-f0-9-]+)$/);
    if (entry_match && method === "PATCH") {
      if (user.role !== "admin") throw new validation_error("仅超级管理员可以回复反馈。", 403);
      require_entry(entry_match[1], user);
      const input = await read_json_body(request, 16 * 1024);
      const reply = validate_message(input.reply, "回复");
      if (!["pending", "resolved"].includes(input.status)) throw new validation_error("反馈状态无效。");
      database.prepare("UPDATE feedback SET reply=?,status=?,updated_at=? WHERE id=?")
        .run(reply, input.status, new Date().toISOString(), entry_match[1]);
      send_json(response, 200, { feedback: serialize(get_entry.get(entry_match[1])) });
      return true;
    }
    throw new validation_error("接口不存在。", 404, "not_found");
  };
}

function validate_message(value, label = "反馈") {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) {
    throw new validation_error(`${label}请填写 1—2000 个字。`);
  }
  return value.trim();
}

async function sanitize_image(file) {
  try {
    const raster = file.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
      file.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) ||
      (file.toString("ascii", 0, 4) === "RIFF" && file.toString("ascii", 8, 12) === "WEBP");
    if (!raster) throw new Error("unsupported_image");
    const image = sharp(file, { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
      throw new Error("unsupported_image");
    }
    const data = await image.rotate().resize({
      width: 2560, height: 2560, fit: "inside", withoutEnlargement: true,
    }).webp({ quality: 85 }).timeout({ seconds: 10 }).toBuffer();
    if (data.length >= feedback_image_limit) throw new Error("image_too_large");
    return data;
  } catch {
    throw new validation_error("图片无法读取。请使用静态 JPG、PNG 或 WebP，且不超过 1600 万像素。");
  }
}

function read_feedback(request) {
  const max_bytes = feedback_body_limit;
  if (Number(request.headers["content-length"]) > max_bytes) {
    throw new validation_error("最多上传 4 张图片，每张须小于 5MB。", 413);
  }
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = busboy({ headers: request.headers, limits: {
        files: 4, fileSize: feedback_image_limit, fields: 1, fieldSize: 8000,
        parts: 6, fieldNameSize: 40,
      } });
    } catch {
      reject(new validation_error("反馈上传格式无效。"));
      return;
    }
    const files = [];
    let message;
    let bytes = 0;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      request.off("aborted", aborted);
      request.off("error", aborted);
      request.off("data", count_bytes);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      request.unpipe(parser);
      parser.destroy();
      request.resume();
      reject(error);
    };
    const aborted = () => fail(new validation_error("上传已中断，请重试。"));
    const count_bytes = (chunk) => {
      bytes += chunk.length;
      if (bytes > max_bytes) fail(new validation_error("上传内容过大。", 413));
    };
    const timer = setTimeout(() => fail(new validation_error("上传超时，请重试。", 408)), 60_000);
    timer.unref();
    request.on("data", count_bytes);
    request.once("aborted", aborted);
    request.once("error", aborted);
    parser.on("field", (name, value, info) => {
      if (name !== "message" || info.valueTruncated || info.nameTruncated || message !== undefined) {
        fail(new validation_error("反馈内容无效或过长。"));
      } else {
        message = value;
      }
    });
    parser.on("file", (name, stream, info) => {
      const chunks = [];
      if (name !== "images" || !accepted_types.has(info.mimeType)) {
        stream.resume();
        fail(new validation_error("仅支持 JPG、PNG 和 WebP 图片。"));
        return;
      }
      stream.on("error", aborted);
      stream.on("limit", () => fail(new validation_error("每张图片必须小于 5MB。", 413)));
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        if (!settled) files.push(Buffer.concat(chunks));
      });
    });
    parser.on("filesLimit", () => fail(new validation_error("最多上传 4 张图片。", 413)));
    parser.on("fieldsLimit", () => fail(new validation_error("反馈字段过多。")));
    parser.on("partsLimit", () => fail(new validation_error("最多上传 4 张图片。", 413)));
    parser.on("error", () => fail(new validation_error("上传内容不完整，请重试。")));
    parser.on("close", () => {
      if (settled) return;
      try {
        const valid_message = validate_message(message);
        settled = true;
        cleanup();
        resolve({ message: valid_message, files });
      } catch (error) {
        fail(error);
      }
    });
    request.pipe(parser);
  });
}
