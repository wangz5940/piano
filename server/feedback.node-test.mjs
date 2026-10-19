import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import sharp from "sharp";
import { create_request_handler } from "./app.mjs";
import { create_session_credentials, hash_password, hash_session_token } from "./auth.mjs";
import { open_database } from "./database.mjs";
import { feedback_image_limit } from "./feedback.mjs";

test("180-day sessions survive reopening, expire exactly, and explicit logout revokes them", async (t) => {
  const f = await fixture(t);
  const result = await f.request("/api/v1/auth/register", {
    method: "POST", json: {
      email: "persistent@example.test", display_name: "学习者", role: "student", password: "persistent-password",
    },
  });
  assert.equal(result.status, 201);
  const cookie = result.headers.getSetCookie().find((value) => value.startsWith("panio_session="));
  assert.match(cookie, /Max-Age=15552000/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  const token = cookie.split(";")[0].slice("panio_session=".length);
  const hash = hash_session_token(token);
  const session = f.repository.raw.prepare("SELECT * FROM sessions WHERE token_hash=?").get(hash);
  assert.equal(Math.round((Date.parse(session.expires_at) - Date.parse(session.created_at)) / 86400000), 180);
  const reopened = open_database(f.database_path);
  assert.ok(reopened.get_session_user(hash, new Date(Date.parse(session.expires_at) - 1).toISOString()));
  assert.equal(reopened.get_session_user(hash, session.expires_at), undefined);
  reopened.close();
  const me = await f.request("/api/v1/auth/me", { cookie });
  assert.equal(me.status, 200);
  assert.match(me.headers.get("set-cookie"), /Max-Age=1555199\d|Max-Age=15552000/);
  assert.equal(f.repository.raw.prepare("SELECT expires_at FROM sessions WHERE token_hash=?").get(hash).expires_at, session.expires_at);
  assert.equal((await f.request("/api/v1/auth/logout", { method: "POST", cookie, json: {} })).status, 200);
  assert.equal((await f.request("/api/v1/auth/me", { cookie })).status, 401);
  const login = await f.request("/api/v1/auth/login", {
    method: "POST", json: { email: "persistent@example.test", password: "persistent-password" },
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /Max-Age=15552000/);
});

test("migration upgrades only unexpired legacy sessions without reviving expired ones", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "panio-session-migration-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = resolve(root, "test.sqlite");
  const db = open_database(path);
  const user = db.create_user({ email: "legacy@example.test", display_name: "旧账号", role: "student", password_hash: "test", password_salt: "test" });
  const now = Date.now();
  for (const [name, age_days] of [["active", 5], ["expired", 50]]) {
    const created_at = new Date(now - age_days * 86400000).toISOString();
    const expires_at = new Date(now + (30 - age_days) * 86400000).toISOString();
    db.raw.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)").run(name, user.id, expires_at, created_at, created_at);
  }
  db.raw.exec("DROP TABLE feedback_images; DROP TABLE feedback; DELETE FROM schema_migrations WHERE version=9;");
  db.close();
  const migrated = open_database(path);
  assert.equal(migrated.raw.prepare("SELECT expires_at FROM sessions WHERE token_hash='active'").get().expires_at, new Date(now + 175 * 86400000).toISOString());
  assert.equal(migrated.get_session_user("expired"), undefined);
  assert.equal(migrated.raw.prepare("SELECT expires_at FROM sessions WHERE token_hash='expired'").get().expires_at, new Date(now - 20 * 86400000).toISOString());
  migrated.close();
});

test("feedback supports four private images, admin replies and complete database backups", async (t) => {
  const f = await fixture(t);
  const picture = await png();
  const posted = await f.post("student", "原谱里有一个音符需要核对。", Array(4).fill(picture));
  assert.equal(posted.status, 201, JSON.stringify(posted.data));
  const entry = posted.data.feedback;
  assert.equal(entry.images.length, 4);
  assert.equal(entry.status, "pending");
  const list = await f.request("/api/v1/feedback", { cookie: f.cookies.student });
  assert.equal(list.data.feedback.length, 1);
  assert.equal(JSON.stringify(list.data).includes('"data":'), false);
  assert.equal((await f.request("/api/v1/feedback", { cookie: f.cookies.parent })).data.feedback.length, 0);
  assert.equal((await f.request("/api/v1/feedback?scope=all", { cookie: f.cookies.parent })).status, 403);
  assert.equal((await f.request("/api/v1/feedback?scope=all", { cookie: f.cookies.admin })).data.feedback.length, 1);
  const url = entry.images[0].url;
  assert.equal((await f.request(url)).status, 401);
  assert.equal((await f.request(url, { cookie: f.cookies.parent })).status, 404);
  const image = await f.request(url, { cookie: f.cookies.student });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("cache-control"), "private, no-store");
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  const metadata = await sharp(image.bytes).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.format, "webp");
  assert.equal((await f.request(url, { cookie: f.cookies.admin })).status, 200);
  const path = `/api/v1/feedback/${entry.id}`;
  assert.equal((await f.request(path, { method: "PATCH", cookie: f.cookies.student, json: { reply: "越权", status: "resolved" } })).status, 403);
  assert.equal((await f.request(path, { method: "PATCH", cookie: f.cookies.admin, json: { reply: "已经修正，谢谢反馈。", status: "resolved" } })).status, 200);
  const updated = await f.request("/api/v1/feedback", { cookie: f.cookies.student });
  assert.equal(updated.data.feedback[0].reply, "已经修正，谢谢反馈。");
  assert.equal(updated.data.feedback[0].status, "resolved");
  const copy = resolve(f.root, "backup.sqlite");
  await backup(f.repository.raw, copy);
  const restored = new DatabaseSync(copy, { readOnly: true });
  assert.equal(restored.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(restored.prepare("SELECT count(*) AS count FROM feedback_images").get().count, 4);
  assert.deepEqual(Buffer.from(restored.prepare("SELECT data FROM feedback_images WHERE id=?").get(entry.images[0].id).data), image.bytes);
  restored.close();
});

test("feedback rejects fifth image, 5MB boundary, fake images, malformed bodies and CSRF atomically", async (t) => {
  const f = await fixture(t);
  const picture = await png();
  assert.equal((await f.post(undefined, "未登录", [])).status, 401);
  assert.equal((await f.post("student", "跨站", [], { Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await f.post("student", "太多图片", Array(5).fill(picture))).status, 413);
  assert.equal((await f.post("student", "超限图片", [Buffer.alloc(feedback_image_limit)])).status, 413);
  assert.equal((await f.post("student", "假图片", [Buffer.from("<svg><script>alert(1)</script></svg>")])).status, 400);
  assert.equal((await f.post("student", "空图片", [Buffer.alloc(0)])).status, 400);
  assert.equal((await f.post("student", " ", [])).status, 400);
  assert.equal((await f.post("student", "文".repeat(2001), [])).status, 400);
  const malformed = await f.request("/api/v1/feedback", {
    method: "POST", cookie: f.cookies.student, body: "broken",
    headers: { "Content-Type": "multipart/form-data; boundary=missing" },
  });
  assert.equal(malformed.status, 400);
  assert.equal(f.repository.raw.prepare("SELECT count(*) AS count FROM feedback").get().count, 0);
  // Invalid requests release the upload slot; the largest permitted input is accepted.
  const near_limit = Buffer.concat([picture, Buffer.alloc(feedback_image_limit - 1 - picture.length)]);
  assert.equal((await f.post("student", "有效图片", [near_limit])).status, 201);
});

test("feedback has persistent per-user and global quotas, plus an atomic image storage limit", async (t) => {
  const f = await fixture(t, { user_daily_limit: 1, daily_limit: 2, storage_limit: 1 });
  assert.equal((await f.post("student", "图片超出存储配额", [await png()])).status, 503);
  assert.equal(f.repository.raw.prepare("SELECT count(*) AS count FROM feedback").get().count, 0);
  assert.equal((await f.post("student", "文字反馈", [])).status, 201);
  assert.equal((await f.post("student", "超过用户每日配额", [])).status, 429);
  assert.equal((await f.post("parent", "另一个用户", [])).status, 201);
  assert.equal((await f.post("admin", "超过全站每日配额", [])).status, 429);
});

async function png() {
  return sharp({ create: { width: 24, height: 24, channels: 3, background: "#547950" } })
    .withMetadata({ exif: { IFD0: { Artist: "private-metadata" } } }).png().toBuffer();
}

async function fixture(t, feedback_options) {
  const root = mkdtempSync(resolve(tmpdir(), "panio-feedback-"));
  const database_path = resolve(root, "test.sqlite");
  const static_root = resolve(root, "dist");
  mkdirSync(static_root);
  writeFileSync(resolve(static_root, "index.html"), "<main>Panio</main>");
  writeFileSync(resolve(root, "catalog.json"), '{"materials":[]}');
  const repository = open_database(database_path);
  const cookies = {};
  for (const role of ["student", "parent", "admin"]) {
    const user = repository.create_user({
      email: `${role}@feedback.example`, display_name: role, role,
      ...await hash_password("feedback-test-password"),
    });
    const session = create_session_credentials();
    repository.create_session({ ...session, user_id: user.id });
    cookies[role] = `panio_session=${session.token}`;
  }
  const server = createServer(create_request_handler({
    repository, static_root, uploads_root: resolve(root, "content"),
    catalog_path: resolve(root, "catalog.json"), feedback_options,
    global_rate_limit: 1000, api_qps: 1000, client_qps: 1000,
    enforce_presence: false, secure_cookies: true, logger: () => {},
  }));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    repository.close();
    rmSync(root, { recursive: true, force: true });
  });
  const request = async (path, { method = "GET", cookie, json, body, headers = {} } = {}) => {
    if (json !== undefined) {
      body = JSON.stringify(json);
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, body, headers: { "X-Panio-Client": "web", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status, headers: response.headers, bytes,
      data: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(bytes) : undefined,
    };
  };
  return {
    root, database_path, repository, cookies, request,
    post(role, message, images, headers) {
      const body = new FormData();
      body.append("message", message);
      images.forEach((image) => body.append("images", new Blob([image], { type: "image/png" }), "../../sample.png"));
      return request("/api/v1/feedback", { method: "POST", cookie: cookies[role], body, headers });
    },
  };
}
