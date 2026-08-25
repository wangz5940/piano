import assert from "node:assert/strict";
import { test } from "node:test";

import { validate_score_document } from "../../server/validation.mjs";
import { apply_teaching_analysis } from "./teaching-analysis.mjs";

test("教学分析按乐句生成 Position → Move → Return 和上下文指法", () => {
  const analyzed = apply_teaching_analysis(create_candidate());

  assert.deepEqual(
    analyzed.hand_positions.map((segment) => ({
      measure_id: segment.range.start.measure_id,
      position_name: segment.position_name,
      movement: segment.movement,
    })),
    [
      {
        measure_id: "measure-1",
        position_name: "C4 Position",
        movement: "stay",
      },
      {
        measure_id: "measure-2",
        position_name: "D4 Position",
        movement: "move",
      },
      {
        measure_id: "measure-3",
        position_name: "C4 Position",
        movement: "return",
      },
    ],
  );

  const first_d = find_note(analyzed, "note-1-d");
  const moved_d = find_note(analyzed, "note-2-d");
  assert.equal(first_d.finger, 2);
  assert.equal(moved_d.finger, 1);
  assert.match(moved_d.fingering.reason, /相邻音|前音|后音/u);
  assert.match(moved_d.fingering.reason, /D4 Position/u);

  for (const segment of analyzed.hand_positions) {
    assert.equal(segment.covered_midis.length, 5);
    assert.deepEqual(
      segment.finger_map.map((entry) => entry.finger),
      [1, 2, 3, 4, 5],
    );
    assert.equal(segment.annotation.source, "generated");
    assert.equal(segment.annotation.status, "candidate");
    assert.ok(segment.annotation.reason.length > 0);
  }

  assert.deepEqual(
    analyzed.lyrics.map((lyric) => lyric.text),
    ["主爱引领", "向前跨步", "安稳归回"],
  );
  assert.equal(validate_score_document(analyzed), analyzed);
});

test("和弦与左手建议区分 PPTX、人工和系统生成来源", () => {
  const analyzed = apply_teaching_analysis(create_candidate());
  const source_chords = analyzed.measures.map((measure) =>
    measure.events.find((event) =>
      event.chord && event.teaching_role !== "left_hand_suggestion"));

  assert.equal(source_chords[0].chord_annotation.source, "pptx");
  assert.equal(source_chords[1].chord_annotation.source, "manual");
  assert.equal(source_chords[2], undefined);

  const suggestions = analyzed.measures.map((measure) =>
    measure.events.find((event) =>
      event.teaching_role === "left_hand_suggestion"));
  assert.ok(suggestions.every(Boolean));
  assert.ok(suggestions.every((event) =>
    event.hand === "left" &&
    event.chord_annotation.source === "generated" &&
    event.chord_annotation.status === "candidate" &&
    event.notes.every((note) =>
      note.fingering.source === "generated" &&
      note.fingering.status === "candidate")));
  assert.match(suggestions[0].chord_annotation.reason, /PPTX/u);
  assert.match(suggestions[1].chord_annotation.reason, /人工/u);
  assert.match(suggestions[2].chord_annotation.reason, /旋律|调性/u);

  const repeated = apply_teaching_analysis(analyzed);
  assert.deepEqual(repeated, analyzed);
});

function create_candidate() {
  return {
    schema_version: 2,
    id: "hymn-task-7",
    number: "999",
    title: "Task 7 candidate",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status: "candidate",
    provenance: {
      kind: "pptx",
      source_id: "hymn-pptx-task-7",
      source_file: "fixtures/task-7.pptx",
      source_sha256: "a".repeat(64),
      font_config_version: "font-v1",
      importer_version: "importer-v1",
      references: [{
        slide_number: 1,
        shape_id: "score-1",
        paragraph_index: 0,
        run_index: 0,
      }],
    },
    lyrics: [
      lyric("lyric-1", "主爱引领", "measure-1"),
      lyric("lyric-2", "向前跨步", "measure-2"),
      lyric("lyric-3", "安稳归回", "measure-3"),
    ],
    hand_positions: [],
    measures: [
      measure("measure-1", [
        event("event-1-d", 0, "note-1-d", 62, {
          chord: "C",
          chord_annotation: annotation(
            "pptx",
            "PPTX 原谱标记 C 和弦。",
          ),
        }),
        event("event-1-g", 1, "note-1-g", 67),
      ]),
      measure("measure-2", [
        event("event-2-d", 0, "note-2-d", 62, {
          chord: "Dm",
          chord_annotation: annotation(
            "manual",
            "人工确认此处使用 Dm。",
          ),
        }),
        event("event-2-a", 1, "note-2-a", 69),
      ]),
      measure("measure-3", [
        event("event-3-e", 0, "note-3-e", 64),
        event("event-3-g", 1, "note-3-g", 67),
      ]),
    ],
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: null,
      published_at: null,
      note: null,
    },
  };
}

function lyric(id, text, measure_id) {
  return {
    id,
    stanza_number: 1,
    text,
    language: "zh-CN",
    event_ids: [],
    range: {
      start: { measure_id, beat: 0 },
      end: { measure_id, beat: 2 },
    },
    slide_number: 1,
    annotation: annotation("pptx", "保留 PPTX 乐句级歌词。"),
  };
}

function measure(id, events) {
  return {
    id,
    number: id.replace("measure-", ""),
    meter: { beats: 4, beat_unit: 4 },
    events,
  };
}

function event(id, onset_beats, note_id, midi, extra = {}) {
  return {
    id,
    onset_beats,
    duration_beats: 1,
    hand: "right",
    voice: 1,
    notes: [{ id: note_id, midi, source_refs: [] }],
    source_refs: [],
    ...extra,
  };
}

function annotation(source, reason) {
  return {
    source,
    status: "candidate",
    reason,
    confirmed_by: null,
    confirmed_at: null,
    source_refs: [],
  };
}

function find_note(document, note_id) {
  return document.measures
    .flatMap((measure) => measure.events)
    .flatMap((event) => event.notes)
    .find((note) => note.id === note_id);
}
