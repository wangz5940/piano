import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  get_simpmusic_font_role,
  simpmusic_font_profile,
  verify_simpmusic_font_profile,
} from "./font-config.mjs";
import {
  lookup_simpmusic_mapping,
  simpmusic_mapping_entry_schema,
  simpmusic_mapping_tables,
} from "./font-mapping.mjs";
import { copy_simpmusic_font_to_public } from "./font-rights.mjs";

const temporary_directories = [];

afterEach(async () => {
  await Promise.all(
    temporary_directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  );
});

test("正确字体通过版本、别名和精确哈希配置验证", async () => {
  const directory = await create_temporary_directory();
  const base_path = join(directory, "SimpMusicBase.ttf");
  const accent_path = join(directory, "SimpMusicAccent.ttf");
  await writeFile(base_path, "base-font-fixture");
  await writeFile(accent_path, "accent-font-fixture");

  assert.equal(get_simpmusic_font_role("SimpMusic Base"), "base");
  assert.equal(get_simpmusic_font_role("SimpMusicBase"), "base");
  assert.equal(get_simpmusic_font_role("SimpMusic Accent"), "accent");
  assert.equal(get_simpmusic_font_role("SimpMusicAccent"), "accent");
  assert.deepEqual(
    Object.keys(simpmusic_mapping_tables).sort(),
    [
      simpmusic_font_profile.fonts.accent.sha256,
      simpmusic_font_profile.fonts.base.sha256,
    ].sort(),
  );
  for (const table of Object.values(simpmusic_mapping_tables)) {
    for (const entry of table.entries) {
      assert.deepEqual(
        Object.keys(entry).sort(),
        [...simpmusic_mapping_entry_schema.required_fields].sort(),
      );
    }
  }

  const verification = await verify_simpmusic_font_profile({
    font_paths: {
      base: base_path,
      accent: accent_path,
    },
    hash_file: async (font_path) =>
      font_path === base_path
        ? simpmusic_font_profile.fonts.base.sha256
        : simpmusic_font_profile.fonts.accent.sha256,
  });

  assert.equal(verification.status, "verified");
  assert.equal(
    verification.profile_version,
    simpmusic_font_profile.profile_version,
  );
  assert.equal(
    verification.mapping_version,
    simpmusic_font_profile.mapping_version,
  );
  assert.equal(verification.fonts.base.path, base_path);
  assert.equal(verification.fonts.accent.path, accent_path);
});

test("字体缺失时停止语义解码并给出明确错误", async () => {
  const directory = await create_temporary_directory();

  await assert.rejects(
    verify_simpmusic_font_profile({
      font_paths: {
        base: join(directory, "missing-base.ttf"),
        accent: join(directory, "missing-accent.ttf"),
      },
    }),
    (error) => {
      assert.equal(error.code, "SIMPMUSIC_FONT_MISSING");
      assert.equal(error.font_role, "base");
      assert.match(error.message, /missing-base\.ttf/u);
      assert.match(error.message, /semantic decoding is disabled/iu);
      return true;
    },
  );
});

test("字体哈希不一致时停止语义解码且不接受替代字体", async () => {
  const directory = await create_temporary_directory();
  const base_path = join(directory, "SimpMusicBase.ttf");
  const accent_path = join(directory, "SimpMusicAccent.ttf");
  await writeFile(base_path, "changed-base-font");
  await writeFile(accent_path, "changed-accent-font");

  await assert.rejects(
    verify_simpmusic_font_profile({
      font_paths: {
        base: base_path,
        accent: accent_path,
      },
    }),
    (error) => {
      assert.equal(error.code, "SIMPMUSIC_FONT_HASH_MISMATCH");
      assert.equal(error.font_role, "base");
      assert.equal(
        error.expected_sha256,
        simpmusic_font_profile.fonts.base.sha256,
      );
      assert.notEqual(error.actual_sha256, error.expected_sha256);
      assert.match(error.message, /semantic decoding is disabled/iu);
      return true;
    },
  );
});

test("未知字形保留原始序列、上下文和待审核状态", () => {
  const raw_sequence = "\u{1f9ea}?";
  const token = lookup_simpmusic_mapping({
    font_hash: simpmusic_font_profile.fonts.base.sha256,
    raw_sequence,
    context: "score_base",
  });

  assert.deepEqual(token, {
    raw_sequence,
    semantic_token: "unknown",
    context: "score_base",
    support_status: "needs_review",
    known: false,
  });
});

test("未授权字体禁止复制到公开构建资源", async () => {
  const directory = await create_temporary_directory();
  const source_path = join(directory, "SimpMusicBase.ttf");
  const public_path = join(directory, "public", "SimpMusicBase.ttf");
  await writeFile(source_path, "private-font");

  await assert.rejects(
    copy_simpmusic_font_to_public({
      source_path,
      destination_path: public_path,
      font_hash: simpmusic_font_profile.fonts.base.sha256,
    }),
    (error) => {
      assert.equal(error.code, "SIMPMUSIC_FONT_PUBLIC_COPY_FORBIDDEN");
      assert.equal(error.rights_status, "private_reference");
      return true;
    },
  );
  await assert.rejects(stat(public_path), { code: "ENOENT" });
});

async function create_temporary_directory() {
  const directory = await mkdtemp(join(tmpdir(), "panio-simpmusic-"));
  temporary_directories.push(directory);
  return directory;
}
