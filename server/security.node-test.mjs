import assert from "node:assert/strict";
import { test } from "node:test";

import {
  create_rate_limiter,
  is_safe_request_target,
  resolve_static_path,
  security_headers,
} from "./security.mjs";

test("安全头限制脚本、嵌入与浏览器能力", () => {
  assert.match(security_headers["Content-Security-Policy"], /default-src 'self'/);
  assert.match(security_headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.equal(security_headers["X-Content-Type-Options"], "nosniff");
  assert.match(security_headers["Permissions-Policy"], /microphone=\(self\)/);
});

test("静态路径不能逃出构建目录", () => {
  const root = "/tmp/panio-dist";
  assert.equal(resolve_static_path(root, "/assets/app.js"), "/tmp/panio-dist/assets/app.js");
  assert.equal(resolve_static_path(root, "/../../etc/passwd"), undefined);
  assert.equal(resolve_static_path(root, "/%2e%2e/%2e%2e/etc/passwd"), undefined);
  assert.equal(resolve_static_path(root, "/bad%00path"), undefined);
  assert.equal(resolve_static_path(root, "/bad\\path"), undefined);
});

test("原始请求目标在 URL 规范化前拒绝目录穿越", () => {
  assert.equal(is_safe_request_target("/materials/catalog.json"), true);
  assert.equal(is_safe_request_target("/%2e%2e/%2e%2e/etc/passwd"), false);
  assert.equal(is_safe_request_target("/../../etc/passwd"), false);
  assert.equal(is_safe_request_target("/bad%00path"), false);
});

test("限流器按窗口计数并限制客户端表大小", () => {
  let timestamp = 1_000;
  const limiter = create_rate_limiter({
    limit: 2,
    window_ms: 1_000,
    max_clients: 2,
    now: () => timestamp,
  });

  assert.equal(limiter.check("client-a").allowed, true);
  assert.equal(limiter.check("client-a").allowed, true);
  assert.equal(limiter.check("client-a").allowed, false);
  timestamp = 2_001;
  assert.equal(limiter.check("client-a").allowed, true);
  limiter.check("client-b");
  limiter.check("client-c");
  assert.equal(limiter.size(), 2);
});
