import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { before, test } from "node:test";

import {
  collect_xml_attribute_values,
  list_slide_part_names,
  open_pptx_archive,
  parse_xml_part,
} from "./ooxml-parser.mjs";
import { scan_hymn_pptx } from "./scanner.mjs";
import {
  hash_serialized_source,
  serialize_source,
} from "./source-serializer.mjs";
import {
  hymn_pptx_input_root,
  project_root,
  readonly_pptx_fixtures,
} from "./test-fixtures.mjs";

let initial_scan;
let initial_input_state;

before(async () => {
  initial_scan = await scan_hymn_pptx({
    input_root: hymn_pptx_input_root,
    project_root,
  });
  initial_input_state = await capture_input_state(initial_scan.files);
});

test("扫描器发现恰好 712 份具有唯一三位编号的 PPTX", () => {
  assert.equal(initial_scan.discovered_file_count, 712);
  assert.equal(initial_scan.files.length, 712);
  assert.deepEqual(initial_scan.failures, []);

  const hymn_ids = initial_scan.files.map((file) => file.hymn_id);
  const source_ids = initial_scan.files.map((file) => file.source_id);
  const score_ids = initial_scan.files.map((file) => file.score_id);

  assert.ok(hymn_ids.every((hymn_id) => /^\d{3}$/u.test(hymn_id)));
  assert.equal(new Set(hymn_ids).size, 712);
  assert.equal(new Set(source_ids).size, 712);
  assert.equal(new Set(score_ids).size, 712);
});

test("固定的 Base、Base+Accent 和无 SimpMusic 样本哈希稳定", () => {
  const files_by_id = new Map(
    initial_scan.files.map((file) => [file.hymn_id, file]),
  );

  for (const fixture of readonly_pptx_fixtures) {
    const file = files_by_id.get(fixture.hymn_id);
    assert.ok(file, `缺少固定样本 ${fixture.file_name}`);
    assert.equal(file.file_name, fixture.file_name);
    assert.equal(file.sha256, fixture.sha256);
  }
});

test("OOXML 基础解析器按结构读取三类固定样本", async () => {
  for (const fixture of readonly_pptx_fixtures) {
    const file_path = resolve(hymn_pptx_input_root, fixture.file_name);
    const archive = await open_pptx_archive(file_path);
    const slide_part_names = list_slide_part_names(archive);
    const presentation = await parse_xml_part(
      archive,
      "ppt/presentation.xml",
    );
    const typefaces = new Set();

    assert.ok(Array.isArray(presentation));
    assert.equal(slide_part_names.length, fixture.slide_count);

    for (const part_name of slide_part_names) {
      const slide = await parse_xml_part(archive, part_name);
      for (const typeface of collect_xml_attribute_values(slide, "typeface")) {
        typefaces.add(typeface);
      }
    }

    assert.equal(classify_font_profile(typefaces), fixture.font_profile);
  }
});

test("来源序列化不受对象键插入顺序影响", () => {
  const first = {
    source_id: "hymn-pptx-001",
    metadata: { title: "至大医生", hymn_id: "001" },
    slides: [{ index: 1 }, { index: 2 }],
  };
  const second = {
    slides: [{ index: 1 }, { index: 2 }],
    metadata: { hymn_id: "001", title: "至大医生" },
    source_id: "hymn-pptx-001",
  };

  assert.equal(serialize_source(first), serialize_source(second));
  assert.equal(
    hash_serialized_source(first),
    hash_serialized_source(second),
  );
});

test("全部 PPTX 在测试前后保持哈希和文件元数据不变", async () => {
  const final_scan = await scan_hymn_pptx({
    input_root: hymn_pptx_input_root,
    project_root,
  });
  const final_input_state = await capture_input_state(final_scan.files);

  assert.deepEqual(final_input_state, initial_input_state);
});

function classify_font_profile(typefaces) {
  const has_base = typefaces.has("SimpMusic Base");
  const has_accent = typefaces.has("SimpMusic Accent");

  if (has_base && has_accent) {
    return "base_accent";
  }
  if (has_base) {
    return "base";
  }
  return "no_simpmusic";
}

async function capture_input_state(files) {
  return Promise.all(files.map(async (file) => {
    const file_stat = await stat(file.absolute_path, { bigint: true });
    return {
      relative_path: file.relative_path,
      sha256: file.sha256,
      byte_length: file_stat.size,
      mode: file_stat.mode,
      modified_at_ns: file_stat.mtimeNs,
    };
  }));
}
