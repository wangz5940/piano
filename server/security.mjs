import { resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

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

/** A bounded token bucket; new clients cannot evict an active client's limits. */
export function create_token_limiter({ rate, burst = rate, max_clients = 2_048, now = Date.now }) {
  const clients = new Map();
  return {
    check(key) {
      const timestamp = now();
      let state = clients.get(key);
      if (!state) {
        if (clients.size >= max_clients) {
          for (const [id, value] of clients) {
            if (timestamp - value.at > 60_000) clients.delete(id);
          }
          if (clients.size >= max_clients) return false;
        }
        state = { tokens: burst, at: timestamp };
        clients.set(key, state);
      }
      state.tokens = Math.min(burst, state.tokens + (timestamp - state.at) * rate / 1_000);
      state.at = timestamp;
      if (state.tokens < 1) return false;
      state.tokens -= 1;
      return true;
    },
  };
}

/** Online means a browser with a live, server-issued 90-second lease. */
export function create_presence_limiter({ limit = 60, per_ip = 10, ttl_ms = 90_000, now = Date.now } = {}) {
  const leases = new Map();
  return {
    acquire(token, ip) {
      const timestamp = now();
      for (const [id, lease] of leases) if (lease.expires <= timestamp) leases.delete(id);
      const existing = token && leases.get(token);
      if (existing && existing.ip === ip) {
        existing.expires = timestamp + ttl_ms;
        return { token, online: leases.size };
      }
      if (leases.size >= limit || [...leases.values()].filter((lease) => lease.ip === ip).length >= per_ip) return undefined;
      const next = randomBytes(24).toString("hex");
      leases.set(next, { ip, expires: timestamp + ttl_ms });
      return { token: next, online: leases.size };
    },
  };
}

export function is_same_origin_write(request) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true; // CLI callers must still carry the custom client header and session.
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}
