import assert from "node:assert/strict";
import { before, test } from "node:test";

import { validate_score_document } from "../../server/validation.mjs";
import { simpmusic_font_profile } from "./font-config.mjs";
import { scan_hymn_pptx } from "./scanner.mjs";
import {
  decode_simpmusic_source_document,
} from "./semantic-decoder.mjs";
import { serialize_source } from "./source-serializer.mjs";
import { create_pptx_source_document } from "./source-document.mjs";
import {
  hymn_pptx_input_root,
  project_root,
} from "./test-fixtures.mjs";

const fixture_ids = Object.freeze(["001", "002", "060", "371"]);

let documents;

before(async () => {
  const scan = await scan_hymn_pptx({
    input_root: hymn_pptx_input_root,
    project_root,
  });
  const files_by_id = new Map(
    scan.files.map((source_file) => [source_file.hymn_id, source_file]),
  );

  documents = new Map(
    await Promise.all(fixture_ids.map(async (hymn_id) => {
      const source_file = files_by_id.get(hymn_id);
      assert.ok(source_file, `缺少固定样本 ${hymn_id}`);
      return [
        hymn_id,
        await create_pptx_source_document(source_file),
      ];
    })),
  );
});

test("Base-only 001 和 371 生成跨页 token 流与 ScoreDocument v2 候选", () => {
  for (const hymn_id of ["001", "371"]) {
    const decoded = decode_simpmusic_source_document(
      documents.get(hymn_id),
    );

    assert.equal(decoded.document_type, "simpmusic_semantic_decode");
    assert.ok(decoded.base_streams.length > 0);
    assert.equal(decoded.accent_associations.length, 0);
    assert.equal(decoded.score_document.schema_version, 2);
    assert.equal(decoded.score_document.number, hymn_id);
    assert.equal(decoded.score_document.status, "needs_review");
    assert.equal(
      validate_score_document(decoded.score_document),
      decoded.score_document,
    );
    assert.deepEqual(
      [...new Set(decoded.base_streams.map((stream) => stream.slide_number))],
      documents.get(hymn_id).slides.map((slide) => slide.index),
    );
  }

  const decoded_371 = decode_simpmusic_source_document(
    documents.get("371"),
  );
  const known_unresolved = decoded_371.base_streams
    .flatMap((stream) => stream.tokens)
    .filter((token) => token.kind === "unresolved")
    .map((token) => token.raw_sequence);
  assert.ok(known_unresolved.includes("^--"));
  assert.ok(known_unresolved.includes("%-1"));
  assert.ok(known_unresolved.includes("qiiU"));
});

test("Base+Accent 002 按 shape 坐标关联覆盖符号并保留双方来源", () => {
  const decoded = decode_simpmusic_source_document(documents.get("002"));

  assert.equal(decoded.accent_associations.length, 5);
  assert.ok(decoded.accent_associations.every(
    (association) => association.base_token_id !== null,
  ));
  assert.ok(decoded.accent_associations.every(
    (association) =>
      association.source_refs.some((source_ref) =>
        source_ref.shape_id === association.accent_shape_id) &&
      association.source_refs.some((source_ref) =>
        source_ref.shape_id === association.base_shape_id),
  ));
  assert.ok(decoded.lyric_phrases.length >= 20);
  assert.ok(decoded.score_document.lyrics.every(
    (lyric) => lyric.annotation.status === "needs_review",
  ));
});

test("多页歌词保持段落/乐句来源，未逐音对齐时保持待审核", () => {
  const decoded = decode_simpmusic_source_document(documents.get("001"));
  const lyric_slides = new Set(
    decoded.score_document.lyrics.map((lyric) => lyric.slide_number),
  );

  assert.equal(lyric_slides.size, 7);
  assert.ok(decoded.score_document.lyrics.every(
    (lyric) =>
      lyric.annotation.status === "needs_review" &&
      lyric.event_ids.length === 0,
  ));
  assert.ok(decoded.issues.some(
    (issue) => issue.code === "lyrics_not_note_aligned",
  ));
});

test("支持映射解码为 degree、accidental、octave、duration、rest、barline、sustain 和 tie", () => {
  const source_document = create_synthetic_source_document({
    score_text: "1#^q0|-~",
    metadata_text: "1=C 4/4",
  });
  const decoded = decode_simpmusic_source_document(source_document, {
    mapping_tables: create_mapping_tables({
      base_entries: [
        mapping("1", "degree.1"),
        mapping("#", "accidental.sharp"),
        mapping("^", "octave.up.1"),
        mapping("q", "duration.eighth"),
        mapping("0", "rest.quarter"),
        mapping("|", "barline.single"),
        mapping("-", "sustain.beat"),
        mapping("~", "tie.start"),
      ],
    }),
  });
  const token_kinds = decoded.base_streams[0].tokens.map(
    (token) => token.kind,
  );

  assert.deepEqual(token_kinds, [
    "degree",
    "accidental",
    "octave",
    "duration",
    "rest",
    "barline",
    "sustain",
    "tie",
  ]);
});

test("未知 token、拍号缺失、时值不闭合、事件重叠和音高歧义进入问题清单", () => {
  const entries = [
    mapping("1", "degree.1"),
    mapping("2", "degree.2"),
    mapping("@", "onset.beats.0"),
    mapping("|", "barline.single"),
  ];
  const unknown_and_ambiguous = decode_simpmusic_source_document(
    create_synthetic_source_document({ score_text: "1?" }),
    { mapping_tables: create_mapping_tables({ base_entries: entries }) },
  );
  assert_issue_codes(unknown_and_ambiguous, [
    "unknown_token",
    "missing_meter",
    "pitch_ambiguity",
  ]);

  const incomplete = decode_simpmusic_source_document(
    create_synthetic_source_document({
      score_text: "1|",
      metadata_text: "1=C 4/4",
    }),
    { mapping_tables: create_mapping_tables({ base_entries: entries }) },
  );
  assert_issue_codes(incomplete, ["incomplete_duration"]);

  const overlap = decode_simpmusic_source_document(
    create_synthetic_source_document({
      score_text: "1@2|",
      metadata_text: "1=C 4/4",
    }),
    { mapping_tables: create_mapping_tables({ base_entries: entries }) },
  );
  assert_issue_codes(overlap, ["event_overlap"]);
});

test("无 SimpMusic 的 060 不伪造候选乐谱", () => {
  const decoded = decode_simpmusic_source_document(documents.get("060"));

  assert.equal(decoded.base_streams.length, 0);
  assert.equal(decoded.score_document, null);
  assert_issue_codes(decoded, ["no_simpmusic", "missing_meter"]);
  assert.ok(decoded.lyric_phrases.length > 0);
});

test("相同来源重复语义解码产生完全相同结果", () => {
  const first = decode_simpmusic_source_document(documents.get("002"));
  const second = decode_simpmusic_source_document(documents.get("002"));

  assert.equal(serialize_source(first), serialize_source(second));
});

function mapping(raw_sequence, semantic_token) {
  return {
    raw_sequence,
    semantic_token,
    context: "score_base",
    support_status: "supported",
  };
}

function create_mapping_tables({
  base_entries,
  accent_entries = [],
}) {
  return {
    [simpmusic_font_profile.fonts.base.sha256]: {
      mapping_version: "test-mapping-v1",
      font_role: "base",
      entries: base_entries,
    },
    [simpmusic_font_profile.fonts.accent.sha256]: {
      mapping_version: "test-mapping-v1",
      font_role: "accent",
      entries: accent_entries,
    },
  };
}

function create_synthetic_source_document({
  score_text,
  metadata_text = "",
}) {
  const shapes = [
    create_shape({
      shape_id: "score-1",
      y: 500,
      raw_text: score_text,
      classification: "score_base",
      font_family: "SimpMusic Base",
    }),
  ];
  if (metadata_text) {
    shapes.push(create_shape({
      shape_id: "metadata-1",
      y: 0,
      raw_text: metadata_text,
      classification: "metadata",
      font_family: "Arial",
    }));
  }

  return {
    schema_version: 1,
    document_type: "pptx_source_document",
    source_id: "hymn-pptx-test",
    score_id: "hymn-test",
    hymn_id: "999",
    title: "Synthetic hymn",
    canvas: { cx: 1_000, cy: 1_000, type: "screen16x9" },
    slides: [{
      index: 1,
      presentation_slide_id: "1",
      relationship_id: "rId1",
      part_name: "ppt/slides/slide1.xml",
      canvas: { cx: 1_000, cy: 1_000, type: "screen16x9" },
      shapes,
    }],
    provenance: {
      source_id: "hymn-pptx-test",
      source_file: "fixtures/999 Synthetic hymn.pptx",
      source_sha256: "a".repeat(64),
      importer: { name: "test", version: "test-v1" },
      font_config_version: "test-font-v1",
      font_mapping_version: "test-mapping-v1",
    },
  };
}

function create_shape({
  shape_id,
  y,
  raw_text,
  classification,
  font_family,
}) {
  return {
    index: 1,
    shape_id,
    name: shape_id,
    geometry: {
      x: 0,
      y,
      cx: 1_000,
      cy: 100,
      rotation: 0,
      rotation_raw: null,
    },
    raw_text,
    paragraphs: [{
      index: 1,
      raw_text,
      runs: [{
        index: 1,
        run_type: "text",
        raw_text,
        font_family,
        classification,
        source: {
          source_id: "hymn-pptx-test",
          slide_index: 1,
          presentation_slide_id: "1",
          slide_part_name: "ppt/slides/slide1.xml",
          shape_id,
          paragraph_index: 1,
          run_index: 1,
        },
      }],
    }],
  };
}

function assert_issue_codes(decoded, expected_codes) {
  const actual_codes = new Set(decoded.issues.map((issue) => issue.code));
  for (const expected_code of expected_codes) {
    assert.ok(
      actual_codes.has(expected_code),
      `缺少导入问题 ${expected_code}，实际为 ${[...actual_codes].join(", ")}`,
    );
  }
}
