import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt_async = promisify(scrypt);
const session_cookie_name = "panio_session";
const password_key_length = 64;

export async function hash_password(password) {
  assert_password(password);
  const salt = randomBytes(16);
  const derived_key = await scrypt_async(password, salt, password_key_length);
  return {
    password_hash: Buffer.from(derived_key).toString("base64url"),
    password_salt: salt.toString("base64url"),
  };
}

export async function verify_password(password, stored) {
  if (typeof password !== "string" || !stored?.password_hash || !stored?.password_salt) {
    return false;
  }
  try {
    const salt = Buffer.from(stored.password_salt, "base64url");
    const expected = Buffer.from(stored.password_hash, "base64url");
    const actual = Buffer.from(
      await scrypt_async(password, salt, expected.length),
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function create_session_credentials({
  now = Date.now(),
  lifetime_ms = 30 * 24 * 60 * 60 * 1_000,
} = {}) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    token_hash: hash_session_token(token),
    expires_at: new Date(now + lifetime_ms).toISOString(),
    max_age_seconds: Math.floor(lifetime_ms / 1_000),
  };
}

export function hash_session_token(token) {
  return createHash("sha256").update(token).digest("base64url");
}

export function parse_session_cookie(cookie_header) {
  if (typeof cookie_header !== "string") {
    return {};
  }
  for (const part of cookie_header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== session_cookie_name) {
      continue;
    }
    const token = part.slice(separator + 1).trim();
    if (/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
      return { token };
    }
  }
  return {};
}

export function serialize_session_cookie(token, {
  secure = false,
  max_age_seconds = 30 * 24 * 60 * 60,
} = {}) {
  return [
    `${session_cookie_name}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${max_age_seconds}`,
    secure ? "Secure" : undefined,
  ].filter(Boolean).join("; ");
}

export function serialize_clear_session_cookie({ secure = false } = {}) {
  return [
    `${session_cookie_name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : undefined,
  ].filter(Boolean).join("; ");
}

export function assert_password(password) {
  if (typeof password !== "string" || [...password].length < 10) {
    throw new Error("密码至少需要 10 个字符");
  }
  if ([...password].length > 128) {
    throw new Error("密码不能超过 128 个字符");
  }
}
