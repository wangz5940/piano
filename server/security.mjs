import { resolve, sep } from "node:path";

export const security_headers = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self), midi=(self), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export function resolve_static_path(root_dir, pathname) {
  let decoded_path;
  try {
    decoded_path = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded_path.includes("\0") || decoded_path.includes("\\")) {
    return undefined;
  }

  const root = resolve(root_dir);
  const candidate = resolve(root, `.${decoded_path}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return undefined;
  }
  return candidate;
}

export function is_safe_request_target(request_target) {
  const raw_path = request_target.split(/[?#]/, 1)[0];
  let decoded_path;
  try {
    decoded_path = decodeURIComponent(raw_path);
  } catch {
    return false;
  }
  if (decoded_path.includes("\0") || decoded_path.includes("\\")) {
    return false;
  }
  return !decoded_path.split("/").includes("..");
}

export function create_rate_limiter({
  limit = 180,
  window_ms = 60_000,
  max_clients = 10_000,
  now = Date.now,
} = {}) {
  const clients = new Map();

  return {
    check(client_id) {
      const timestamp = now();
      const existing = clients.get(client_id);
      if (!existing || timestamp >= existing.reset_at) {
        if (!existing && clients.size >= max_clients) {
          evict_oldest_client(clients);
        }
        clients.set(client_id, {
          count: 1,
          reset_at: timestamp + window_ms,
          last_seen_at: timestamp,
        });
        return { allowed: true, remaining: limit - 1, retry_after_seconds: 0 };
      }

      clients.delete(client_id);
      existing.count += 1;
      existing.last_seen_at = timestamp;
      clients.set(client_id, existing);
      const retry_after_seconds = Math.max(
        1,
        Math.ceil((existing.reset_at - timestamp) / 1_000),
      );
      return {
        allowed: existing.count <= limit,
        remaining: Math.max(0, limit - existing.count),
        retry_after_seconds,
      };
    },
    size() {
      return clients.size;
    },
  };
}

function evict_oldest_client(clients) {
  const oldest_key = clients.keys().next().value;
  if (oldest_key !== undefined) {
    clients.delete(oldest_key);
  }
}
