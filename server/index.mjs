import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { create_request_handler } from "./app.mjs";
import { open_database } from "./database.mjs";

const project_root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const static_root = resolve(project_root, process.env.STATIC_DIR ?? "dist");
const uploads_root = resolve(project_root, process.env.PANIO_UPLOADS_DIR ?? "data/content");
const database_path = resolve(
  project_root,
  process.env.PANIO_DATABASE_PATH ?? "data/panio.sqlite",
);
const catalog_path = resolve(project_root, "public/materials/catalog.json");
const host = process.env.HOST ?? "0.0.0.0";
const port = parse_positive_integer(process.env.PORT, 4173);
const rate_limit = parse_positive_integer(process.env.RATE_LIMIT_PER_MINUTE, 180);
const auth_rate_limit = parse_positive_integer(process.env.AUTH_RATE_LIMIT, 10);
const max_connections = parse_positive_integer(process.env.MAX_CONNECTIONS, 1_000);
const trust_proxy = process.env.TRUST_PROXY === "1";
const tls_enabled = Boolean(process.env.TLS_KEY_FILE && process.env.TLS_CERT_FILE);
const secure_cookies = tls_enabled || process.env.COOKIE_SECURE === "1";
const api_only = process.env.PANIO_API_ONLY === "1";

if (!api_only && !existsSync(resolve(static_root, "index.html"))) {
  throw new Error(`未找到生产构建：${static_root}/index.html，请先运行 npm run build`);
}
if (!existsSync(catalog_path)) {
  throw new Error(`未找到教材目录：${catalog_path}`);
}

const repository = open_database(database_path);
repository.cleanup_expired_sessions();
const request_handler = create_request_handler({
  repository,
  static_root,
  uploads_root,
  catalog_path,
  tls_enabled,
  secure_cookies,
  trust_proxy,
  global_rate_limit: rate_limit,
  auth_rate_limit,
});
const server = create_server(request_handler);

server.requestTimeout = 15_000;
server.headersTimeout = 8_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;
server.maxRequestsPerSocket = 100;
server.maxConnections = max_connections;
server.on("clientError", (_error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  }
});

const cleanup_timer = setInterval(() => {
  repository.cleanup_expired_sessions();
}, 60 * 60_000);
cleanup_timer.unref();

server.listen(port, host, () => {
  const protocol = tls_enabled ? "https" : "http";
  console.log(`练琴簿业务后端已启动：${protocol}://${host}:${port}`);
  console.log(`健康检查：${protocol}://127.0.0.1:${port}/api/v1/health`);
  console.log(`数据库：${database_path}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    clearInterval(cleanup_timer);
    server.close(() => {
      repository.close();
      process.exit(0);
    });
  });
}

function create_server(handler) {
  const key_file = process.env.TLS_KEY_FILE;
  const cert_file = process.env.TLS_CERT_FILE;
  if (!key_file && !cert_file) {
    return createHttpServer(handler);
  }
  if (!key_file || !cert_file) {
    throw new Error("启用 TLS 时必须同时设置 TLS_KEY_FILE 和 TLS_CERT_FILE");
  }
  return createHttpsServer({
    key: readFileSync(resolve(key_file)),
    cert: readFileSync(resolve(cert_file)),
    minVersion: "TLSv1.2",
  }, handler);
}

function parse_positive_integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
