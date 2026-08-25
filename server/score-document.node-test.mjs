import assert from "node:assert/strict";
import { test } from "node:test";

import { migrate_score_document } from "../src/features/score/migration-runtime.mjs";
import { open_database } from "./database.mjs";
import { validate_score_document } from "./validation.mjs";

const legacy_document = {
  schema_version: 1,
  id: "score-demo-c-major",
  title: "Legacy score",
  key_signature: "F major",
  tonic_midi: 65,
  time_signature: "3/4",
  measures: [{
    id: "legacy-measure",
    number: "1",
    meter: { beats: 3, beat_unit: 4 },
    events: [
      {
        id: "legacy-right",
        onset_beats: 0,
        duration_beats: 1.5,
        hand: "right",
        voice: 1,
        notes: [{ id: "legacy-note-right", midi: 69, finger: 3 }],
        chord: "F",
      },
      {
        id: "legacy-left",
        onset_beats: 1.5,
        duration_beats: 1.5,
        hand: "left",
        voice: 2,
        notes: [{ id: "legacy-note-left", midi: 41, finger: 5 }],
        chord: "C7",
      },
    ],
  }],
};

test("数据库保留 v1 原文并在读取、草稿和发布边界迁移为 v2", () => {
  const repository = open_database(":memory:");
  const legacy_json = JSON.stringify(legacy_document);
  repository.raw.prepare(`
    UPDATE score_versions
    SET document_json = ?, document_schema_version = 1, source_sha256 = ?
    WHERE id = 'score-demo-c-major-v1'
  `).run(legacy_json, "a".repeat(64));

  const version = repository.get_score_version("score-demo-c-major-v1");
  const [right_event, left_event] = version.document.measures[0].events;
  assert.equal(version.document.schema_version, 2);
  assert.equal(version.document.status, "published");
  assert.deepEqual(
    {
      midi: right_event.notes[0].midi,
      duration: right_event.duration_beats,
      hand: right_event.hand,
      finger: right_event.notes[0].finger,
      chord: right_event.chord,
    },
    { midi: 69, duration: 1.5, hand: "right", finger: 3, chord: "F" },
  );
  assert.deepEqual(
    {
      midi: left_event.notes[0].midi,
      duration: left_event.duration_beats,
      hand: left_event.hand,
      finger: left_event.notes[0].finger,
      chord: left_event.chord,
    },
    { midi: 41, duration: 1.5, hand: "left", finger: 5, chord: "C7" },
  );
  assert.equal(
    repository.raw.prepare(`
      SELECT document_schema_version AS version FROM score_versions
      WHERE id = 'score-demo-c-major-v1'
    `).get().version,
    1,
  );
  assert.equal(
    repository.raw.prepare(`
      SELECT document_json FROM score_versions WHERE id = 'score-demo-c-major-v1'
    `).get().document_json,
    legacy_json,
  );

  const user = repository.create_user({
    email: "score-reviewer@example.com",
    display_name: "Score reviewer",
    role: "admin",
    password_hash: "hash",
    password_salt: "salt",
  });
  const draft = repository.create_score_draft(
    user.id,
    "score-demo-c-major",
    "score-demo-c-major-v1",
  );
  assert.equal(draft.document.schema_version, 2);
  assert.equal(draft.document.status, "needs_review");
  assert.equal(draft.document.measures[0].events[0].notes[0].midi, 69);
  assert.equal(
    repository.raw.prepare(`
      SELECT document_schema_version AS version FROM score_drafts WHERE id = ?
    `).get(draft.id).version,
    2,
  );

  const published = repository.publish_score_draft(user.id, draft.id);
  assert.equal(published.document.schema_version, 2);
  assert.equal(published.document.status, "published");
  assert.equal(published.document.review.published_by, user.id);
  assert.equal(published.document.measures[0].events[1].chord, "C7");
  repository.close();
});

test("v2 校验覆盖 PPTX 来源、歌词、手位、指法和标注状态", () => {
  const document = migrate_score_document(legacy_document);
  document.provenance = {
    kind: "pptx",
    source_id: "hymn-001",
    source_file: "001 hymn.pptx",
    source_sha256: "b".repeat(64),
    font_config_version: "simpmusic-v1",
    importer_version: "pptx-importer-v1",
    references: [{
      slide_number: 1,
      shape_id: "shape-1",
      paragraph_index: 0,
      run_index: 0,
    }],
  };
  const candidate_annotation = {
    source: "generated",
    status: "needs_review",
    reason: "Candidate alignment requires review",
    confirmed_by: null,
    confirmed_at: null,
    source_refs: [],
  };
  document.lyrics = [{
    id: "lyric-1",
    stanza_number: 1,
    text: "Grace",
    language: "zh-CN",
    event_ids: ["legacy-right"],
    range: null,
    slide_number: 1,
    annotation: structuredClone(candidate_annotation),
  }];
  document.hand_positions = [{
    id: "position-1",
    hand: "right",
    range: {
      start: { measure_id: "legacy-measure", beat: 0 },
      end: { measure_id: "legacy-measure", beat: 3 },
    },
    position_name: "F4 Position",
    covered_midis: [65, 67, 69, 70, 72],
    finger_map: [
      { finger: 1, midi: 65 },
      { finger: 2, midi: 67 },
      { finger: 3, midi: 69 },
      { finger: 4, midi: 70 },
      { finger: 5, midi: 72 },
    ],
    movement: "stay",
    annotation: structuredClone(candidate_annotation),
  }];

  assert.equal(validate_score_document(document), document);

  const invalid_status = structuredClone(document);
  invalid_status.hand_positions[0].annotation.status = "unknown";
  assert.throws(
    () => validate_score_document(invalid_status),
    /手位说明状态无效/,
  );

  const invalid_range = structuredClone(document);
  invalid_range.hand_positions[0].range.start.beat = 3;
  invalid_range.hand_positions[0].range.end.beat = 1;
  assert.throws(
    () => validate_score_document(invalid_range),
    /手位范围终点不能早于起点/,
  );

  const publish_candidate = structuredClone(document);
  publish_candidate.status = "published";
  publish_candidate.review = {
    reviewed_by: "reviewer",
    reviewed_at: "2026-07-24T00:00:00.000Z",
    published_by: "reviewer",
    published_at: "2026-07-24T00:00:00.000Z",
    note: null,
  };
  assert.throws(
    () => validate_score_document(publish_candidate, { for_publish: true }),
    /候选或待审核标注不能发布/,
  );
});
