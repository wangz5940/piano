import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import {
  simpmusic_font_config_entry,
  simpmusic_font_profile,
} from "./font-config.mjs";
import {
  open_pptx_archive,
  resolve_presentation_slides,
} from "./ooxml-parser.mjs";
import { scan_hymn_pptx } from "./scanner.mjs";
import {
  build_source_document_artifacts,
  classify_pptx_run,
  create_pptx_source_document,
  write_source_document_artifacts,
} from "./source-document.mjs";
import { serialize_source } from "./source-serializer.mjs";
import {
  hymn_pptx_input_root,
  project_root,
} from "./test-fixtures.mjs";

const fixtures = Object.freeze([
  Object.freeze({
    hymn_id: "001",
    file_name: "001 至大医生.pptx",
    sha256: "1b58f043d0fefe0a1d89f3eacc4906d1239ea838cccec201bd8cb94c3c5797d3",
    slide_ids: Object.freeze(["303", "316", "317", "318", "319", "320", "322"]),
    slide_count: 7,
    base_run_count: 665,
    accent_run_count: 0,
  }),
  Object.freeze({
    hymn_id: "002",
    file_name: "002 离弃宝座撇下王冕.pptx",
    sha256: "76d11dc6f3f4f346d81e516f2b456280a2bf9214ed49fa3d12d797ca91ebfa5a",
    slide_ids: Object.freeze(["303", "308", "309", "310", "312"]),
    slide_count: 5,
    base_run_count: 481,
    accent_run_count: 5,
  }),
  Object.freeze({
    hymn_id: "371",
    file_name: "371 耶稣爱我.pptx",
    sha256: "66bf73bbd08816794fd6ec702727ee5640b90bc3ef6c61c1e78075f4fc31b7db",
    slide_ids: Object.freeze(["309", "310", "312"]),
    slide_count: 3,
    base_run_count: 209,
    accent_run_count: 0,
  }),
]);

let documents;
let files_by_id;
let temporary_root;

before(async () => {
  const scan = await scan_hymn_pptx({
    input_root: hymn_pptx_input_root,
    project_root,
  });
  files_by_id = new Map(scan.files.map((file) => [file.hymn_id, file]));
  documents = new Map(
    await Promise.all(fixtures.map(async (fixture) => {
      const source_file = files_by_id.get(fixture.hymn_id);
      assert.ok(source_file, `缺少固定样本 ${fixture.file_name}`);
      return [
        fixture.hymn_id,
        await create_pptx_source_document(source_file),
      ];
    })),
  );
  temporary_root = await mkdtemp(join(tmpdir(), "panio-pptx-source-"));
});

after(async () => {
  if (temporary_root) {
    await rm(temporary_root, { recursive: true, force: true });
  }
});

test("001、002、371 按 presentation 关系顺序保留页数和画布", () => {
  for (const fixture of fixtures) {
    const document = documents.get(fixture.hymn_id);
    assert.ok(document);
    assert.equal(document.slides.length, fixture.slide_count);
    assert.deepEqual(
      document.slides.map((slide) => slide.presentation_slide_id),
      fixture.slide_ids,
    );
    assert.deepEqual(
      document.slides.map((slide) => slide.relationship_id),
      Array.from(
        { length: fixture.slide_count },
        (_, index) => `rId${index + 2}`,
      ),
    );
    assert.deepEqual(
      document.slides.map((slide) => slide.part_name),
      Array.from(
        { length: fixture.slide_count },
        (_, index) => `ppt/slides/slide${index + 1}.xml`,
      ),
    );
    assert.deepEqual(document.canvas, {
      cx: 9144000,
      cy: 5143500,
      type: "screen16x9",
    });
  }
});

test("幻灯片顺序解析不依赖 ZIP 或 relationships 枚举顺序", async () => {
  const source_file = files_by_id.get("371");
  assert.ok(source_file);
  const archive = await open_pptx_archive(source_file.absolute_path);

  archive.zip.file("ppt/presentation.xml", presentation_with_reordered_slides());
  archive.zip.file(
    "ppt/_rels/presentation.xml.rels",
    relationships_with_scrambled_enumeration(),
  );

  const slides = await resolve_presentation_slides(archive);
  assert.deepEqual(
    slides.map((slide) => slide.part_name),
    [
      "ppt/slides/slide3.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
    ],
  );
  assert.deepEqual(
    slides.map((slide) => slide.presentation_slide_id),
    ["900", "901", "902"],
  );
});

test("001 保留 shape 几何、歌词颜色和 Base run 原始格式", () => {
  const document = documents.get("001");
  const score_shape = find_shape(document, 1, "14");
  assert.equal(score_shape.name, "矩形 13");
  assert.deepEqual(score_shape.geometry, {
    x: 899992,
    y: 771550,
    cx: 8172000,
    cy: 492443,
    rotation: 0,
    rotation_raw: null,
  });

  const [first_run, normalized_run] = score_shape.paragraphs[0].runs;
  assert.equal(first_run.raw_text, "t");
  assert.equal(first_run.font_family, "SimpMusic Base");
  assert.equal(first_run.font_size_hundredth_points, 3200);
  assert.equal(first_run.character_spacing_hundredth_points, 150);
  assert.equal(first_run.bold, null);
  assert.equal(first_run.normalize_h, null);
  assert.equal(first_run.classification, "score_base");
  assert.equal(normalized_run.raw_text, "|");
  assert.equal(normalized_run.normalize_h, true);
  assert.deepEqual(first_run.source, {
    source_id: "hymn-pptx-001",
    slide_index: 1,
    presentation_slide_id: "303",
    slide_part_name: "ppt/slides/slide1.xml",
    shape_id: "14",
    paragraph_index: 1,
    run_index: 1,
  });

  const blue_lyrics_run = find_run(document, (run) => run.raw_text === "至佳");
  assert.equal(blue_lyrics_run.classification, "lyrics");
  assert.deepEqual(blue_lyrics_run.color, {
    kind: "srgb",
    value: "0432FF",
    transformations: [],
  });

  const lyrics_shape = find_shape(document, 1, "18");
  assert.deepEqual(lyrics_shape.paragraphs[0].line_spacing, {
    kind: "hundredth_points",
    value: 4200,
  });
});

test("002 保留独立 Accent shape、粗体和完整来源定位", () => {
  const document = documents.get("002");
  const accent_shape = find_shape(document, 1, "9");
  assert.equal(accent_shape.name, "文本框 8");
  assert.deepEqual(accent_shape.geometry, {
    x: 4356000,
    y: 3608621,
    cx: 205184,
    cy: 492443,
    rotation: 0,
    rotation_raw: null,
  });

  const [accent_run] = accent_shape.paragraphs[0].runs;
  assert.equal(accent_run.raw_text, "-");
  assert.equal(accent_run.font_family, "SimpMusic Accent");
  assert.equal(accent_run.font_size_hundredth_points, 3200);
  assert.equal(accent_run.bold, true);
  assert.equal(accent_run.classification, "score_accent");
  assert.equal(accent_run.raw_ooxml.element, "a:r");
  assert.equal(accent_run.raw_ooxml.children[0][":@"].b, "1");
  assert.equal(accent_run.source.shape_id, "9");
  assert.equal(accent_run.source.run_index, 1);
});

test("371 保留无显式字体的歌词 run 与 SimpMusic Base run", () => {
  const document = documents.get("371");
  const score_shape = find_shape(document, 1, "3");
  assert.deepEqual(score_shape.geometry, {
    x: 432000,
    y: 756000,
    cx: 8419022,
    cy: 492443,
    rotation: 0,
    rotation_raw: null,
  });
  assert.equal(score_shape.paragraphs[0].runs[0].raw_text, "^--");
  assert.equal(
    score_shape.paragraphs[0].runs[0].classification,
    "score_base",
  );

  const lyrics_run = find_run(document, (run) => run.raw_text === "耶");
  assert.equal(lyrics_run.font_family, null);
  assert.equal(lyrics_run.classification, "lyrics");
  assert.equal(lyrics_run.source.slide_index, 1);
});

test("三份样本的字体 run 数量和分类保持稳定", () => {
  for (const fixture of fixtures) {
    const runs = collect_runs(documents.get(fixture.hymn_id));
    assert.equal(
      runs.filter((run) => run.classification === "score_base").length,
      fixture.base_run_count,
    );
    assert.equal(
      runs.filter((run) => run.classification === "score_accent").length,
      fixture.accent_run_count,
    );
  }
});

test("run 分类覆盖 Base、Accent、歌词、元数据和未知原文", () => {
  assert.equal(classify_pptx_run({
    font_family: "SimpMusic Base",
    raw_text: "qiiU",
  }), "score_base");
  assert.equal(classify_pptx_run({
    font_family: "SimpMusic Accent",
    raw_text: "-",
  }), "score_accent");
  assert.equal(classify_pptx_run({
    font_family: "SimHei",
    raw_text: "耶稣爱我",
  }), "lyrics");
  assert.equal(classify_pptx_run({
    font_family: "SimHei",
    raw_text: "1=C",
  }), "metadata");
  assert.equal(classify_pptx_run({
    font_family: "Arial",
    raw_text: "unclassified source text",
  }), "unknown");
});

test("source-layout.json 与 provenance.json 确定且包含完整版本来源", async () => {
  const document = documents.get("001");
  const first = build_source_document_artifacts(document);
  const second_document = await create_pptx_source_document(
    files_by_id.get("001"),
  );
  const second = build_source_document_artifacts(second_document);

  assert.equal(
    first.source_layout_json,
    serialize_source(first.source_layout),
  );
  assert.equal(first.source_layout_json, second.source_layout_json);
  assert.equal(first.provenance_json, second.provenance_json);
  assert.equal(first.provenance.source_sha256, fixtures[0].sha256);
  assert.equal(first.provenance.importer.name, "panio-hymn-pptx");
  assert.match(first.provenance.importer.version, /^pptx-source-v\d+$/u);
  assert.equal(
    first.provenance.font_config_version,
    simpmusic_font_profile.profile_version,
  );
  assert.equal(
    first.provenance.font_mapping_version,
    simpmusic_font_profile.mapping_version,
  );
  assert.equal(
    first.provenance.font_config.version,
    simpmusic_font_profile.profile_version,
  );
  assert.match(
    first.provenance.font_config.content_sha256,
    /^[a-f0-9]{64}$/u,
  );
  assert.deepEqual(
    first.provenance.font_config.entries,
    JSON.parse(serialize_source(simpmusic_font_config_entry)),
  );
  assert.equal(
    first.source_layout.provenance_id,
    first.provenance.provenance_id,
  );
  assert.match(first.provenance.source_layout_sha256, /^[a-f0-9]{64}$/u);

  const output_directory = resolve(temporary_root, "001");
  await write_source_document_artifacts(output_directory, document);
  assert.equal(
    await readFile(resolve(output_directory, "source-layout.json"), "utf8"),
    first.source_layout_json,
  );
  assert.equal(
    await readFile(resolve(output_directory, "provenance.json"), "utf8"),
    first.provenance_json,
  );
});

function find_shape(document, slide_index, shape_id) {
  const slide = document?.slides[slide_index - 1];
  const shape = slide?.shapes.find((candidate) =>
    candidate.shape_id === shape_id);
  assert.ok(shape, `第 ${slide_index} 页缺少 shape ${shape_id}`);
  return shape;
}

function find_run(document, predicate) {
  const run = collect_runs(document).find(predicate);
  assert.ok(run, "未找到预期 run");
  return run;
}

function collect_runs(document) {
  return document.slides.flatMap((slide) =>
    slide.shapes.flatMap((shape) =>
      shape.paragraphs.flatMap((paragraph) => paragraph.runs)));
}

function presentation_with_reordered_slides() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="900" r:id="rIdSlideC"/>
    <p:sldId id="901" r:id="rIdSlideA"/>
    <p:sldId id="902" r:id="rIdSlideB"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
</p:presentation>`;
}

function relationships_with_scrambled_enumeration() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdSlideB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rIdSlideC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
  <Relationship Id="rIdSlideA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`;
}
