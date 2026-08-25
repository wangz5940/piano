import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const simpmusic_font_profile = Object.freeze({
  schema_version: 1,
  profile_version: "simpmusic-font-profile-v1",
  mapping_version: "simpmusic-mapping-v1",
  fonts: Object.freeze({
    base: Object.freeze({
      role: "base",
      file_name: "SimpMusicBase.ttf",
      family_names: Object.freeze(["SimpMusic Base", "SimpMusicBase"]),
      sha256:
        "299d79d5cf40058c70f1c8a5ccedee7cb69142ac444d63925ce6057f9f636797",
      path_environment_variable: "SIMPMUSIC_BASE_FONT_PATH",
    }),
    accent: Object.freeze({
      role: "accent",
      file_name: "SimpMusicAccent.ttf",
      family_names: Object.freeze(["SimpMusic Accent", "SimpMusicAccent"]),
      sha256:
        "50da44991631cf8a555381359d0dd91d11143e99ac5c80bd9afb62b08a91c792",
      path_environment_variable: "SIMPMUSIC_ACCENT_FONT_PATH",
    }),
  }),
});

export const simpmusic_font_config_entry = simpmusic_font_profile.fonts;

export class SimpMusicFontVerificationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SimpMusicFontVerificationError";
    Object.assign(this, details);
  }
}

export function get_simpmusic_font_role(typeface) {
  const normalized_typeface = String(typeface ?? "").trim();

  for (const [role, entry] of Object.entries(simpmusic_font_config_entry)) {
    if (entry.family_names.includes(normalized_typeface)) {
      return role;
    }
  }

  return undefined;
}

export async function resolve_simpmusic_font_paths({
  font_paths = {},
  environment = process.env,
  home_directory = homedir(),
  platform = process.platform,
} = {}) {
  const resolved_paths = {};

  for (const [role, font] of Object.entries(simpmusic_font_profile.fonts)) {
    const explicit_path = font_paths[role];
    const environment_path = environment[font.path_environment_variable];

    if (explicit_path) {
      resolved_paths[role] = resolve(String(explicit_path));
      continue;
    }
    if (environment_path) {
      resolved_paths[role] = resolve(String(environment_path));
      continue;
    }

    const candidates = get_default_font_path_candidates({
      font,
      home_directory,
      platform,
      environment,
    });
    resolved_paths[role] =
      await find_first_readable_path(candidates) ?? candidates[0];
  }

  return Object.freeze(resolved_paths);
}

export async function verify_simpmusic_font_profile({
  hash_file = sha256_file,
  ...path_options
} = {}) {
  const font_paths = await resolve_simpmusic_font_paths(path_options);
  const verified_fonts = {};

  for (const [role, font] of Object.entries(simpmusic_font_profile.fonts)) {
    const font_path = font_paths[role];

    try {
      await access(font_path, constants.R_OK);
    } catch (cause) {
      throw new SimpMusicFontVerificationError(
        `SimpMusic ${role} font is missing or unreadable at ${font_path}; semantic decoding is disabled.`,
        {
          cause,
          code: "SIMPMUSIC_FONT_MISSING",
          font_role: role,
          font_path,
          expected_sha256: font.sha256,
        },
      );
    }

    const actual_sha256 = await hash_file(font_path);
    if (actual_sha256 !== font.sha256) {
      throw new SimpMusicFontVerificationError(
        `SimpMusic ${role} font hash mismatch at ${font_path}; semantic decoding is disabled.`,
        {
          code: "SIMPMUSIC_FONT_HASH_MISMATCH",
          font_role: role,
          font_path,
          expected_sha256: font.sha256,
          actual_sha256,
        },
      );
    }

    verified_fonts[role] = Object.freeze({
      path: font_path,
      sha256: actual_sha256,
      family_names: font.family_names,
    });
  }

  return Object.freeze({
    status: "verified",
    profile_version: simpmusic_font_profile.profile_version,
    mapping_version: simpmusic_font_profile.mapping_version,
    fonts: Object.freeze(verified_fonts),
  });
}

export async function assert_simpmusic_semantic_decoding_ready(options = {}) {
  return verify_simpmusic_font_profile(options);
}

async function sha256_file(file_path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(file_path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function get_default_font_path_candidates({
  font,
  home_directory,
  platform,
  environment,
}) {
  if (platform === "darwin") {
    return [
      join(home_directory, "Library", "Fonts", font.file_name),
      join("/Library", "Fonts", font.file_name),
      join("/System", "Library", "Fonts", font.file_name),
    ];
  }
  if (platform === "win32") {
    const windows_directory = environment.WINDIR ?? "C:\\Windows";
    return [join(windows_directory, "Fonts", font.file_name)];
  }

  return [
    join(home_directory, ".local", "share", "fonts", font.file_name),
    join(home_directory, ".fonts", font.file_name),
    join("/usr", "local", "share", "fonts", font.file_name),
    join("/usr", "share", "fonts", font.file_name),
  ];
}

async function find_first_readable_path(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // Keep checking configured locations; no system font substitution occurs.
    }
  }

  return undefined;
}
