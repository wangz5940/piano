import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

import { build_full_hymn_import } from "./full-import.mjs";
import { scan_hymn_pptx } from "./scanner.mjs";
import {
  hymn_pptx_input_root,
  project_root,
} from "./test-fixtures.mjs";

let output_root;
let first;
let input_before;

before(async () => {
  output_root = await mkdtemp(resolve(tmpdir(), "panio-hymn-full-import-"));
  input_before = await source_hashes();
  first = await build_full_hymn_import({
    input_root: hymn_pptx_input_root,
    project_root,
    output_root,
    manifest_only: true,
  });
});

after(async () => {
  await rm(output_root, { recursive: true, force: true });
});

test("全量目录包含 712 首、2658 张幻灯片和稳定唯一标识", async () => {
  assert.equal(first.catalog.summary.hymn_count, 712);
  assert.equal(first.catalog.summary.slide_count, 2658);
  assert.equal(first.catalog.hymns.length, 712);
  assert.equal(first.catalog.slides.length, 2658);
  assert.equal(first.report.summary.base_usage_count, 709);
  assert.equal(first.report.summary.accent_usage_count, 173);

  for (const key of ["hymn_id", "source_id", "score_id"]) {
    const values = first.catalog.hymns.map((entry) => entry[key]);
    assert.equal(new Set(values).size, 712, `${key} 不唯一`);
  }

  for (const entry of first.catalog.hymns) {
    assert.match(entry.source_sha256, /^[a-f0-9]{64}$/u);
    await access(resolve(project_root, entry.source_file));
  }
});

test("报告单列三份无 SimpMusic 文件及其他质量类别", () => {
  assert.deepEqual(
    first.report.categories.no_simpmusic.map((entry) => entry.hymn_id),
    ["060", "063", "444"],
  );
  for (const category of [
    "unknown_glyph",
    "decode_failure",
    "structure_failure",
  ]) {
    assert.ok(Array.isArray(first.report.categories[category]));
  }
});

test("候选目录不会产生 published 状态", () => {
  assert.equal(first.catalog.publication_scope, "candidate_only");
  assert.ok(first.catalog.hymns.every((entry) =>
    entry.status !== "published"));
});

test("重复全量构建 manifest 和内容哈希确定且输入不变", async () => {
  const second = await build_full_hymn_import({
    input_root: hymn_pptx_input_root,
    project_root,
    output_root,
    manifest_only: true,
  });
  assert.deepEqual(second.manifest, first.manifest);
  assert.deepEqual(await source_hashes(), input_before);
});

async function source_hashes() {
  const scan = await scan_hymn_pptx({
    input_root: hymn_pptx_input_root,
    project_root,
  });
  return scan.files.map((file) => ({
    relative_path: file.relative_path,
    byte_length: file.byte_length,
    sha256: file.sha256,
  }));
}
