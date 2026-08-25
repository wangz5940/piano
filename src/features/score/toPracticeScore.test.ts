import { describe, expect, it } from "vitest";

import type {
  score_annotation,
  score_document_v2,
} from "./types";
import {
  to_practice_score,
  type published_score_version,
} from "./toPracticeScore";

describe("to_practice_score", () => {
  it("把已发布 ScoreDocument 转为保留双手、时值、指法和手位的练习谱", () => {
    const score = to_practice_score(make_version());

    expect(score).toMatchObject({
      id: "hymn-371",
      score_version_id: "hymn-371-v2",
      score_document: { status: "published" },
      key_signature: "C major",
      jianpu_tonic_midi: 60,
      time_signature: "4/4",
      source: {
        status: "published",
        content_sha256: "a".repeat(64),
      },
      measure_beats: [4, 3],
      measure_beat_units: [4, 4],
    });
    expect(score.steps).toHaveLength(2);
    expect(score.steps[0]).toMatchObject({
      measure_index: 1,
      beat_index: 1,
      beat_in_measure: 1,
      notes: [48, 64],
      hand: "both",
      duration_beats: 2,
      match_mode: "chord",
    });
    expect(score.steps[0].fingerings).toEqual([
      { note: 48, hand: "left", finger: 5, source: "score" },
      { note: 64, hand: "right", finger: 3, source: "score" },
    ]);
    expect(score.steps[1]).toMatchObject({
      measure_index: 2,
      beat_index: 4,
      beat_in_measure: 0,
      notes: [67],
      hand: "right",
      duration_beats: 1,
    });
    expect(score.finger_guide.position_map).toEqual([
      expect.objectContaining({
        label: "C4 Position",
        start_note: "C4",
        notes: ["C4", "D4", "E4", "F4", "G4"],
        fingers: ["1", "2", "3", "4", "5"],
        movement: "stay",
      }),
      expect.objectContaining({
        label: "D4 Position",
        movement: "move",
      }),
    ]);
  });

  it("拒绝候选状态或缺少发布记录的版本", () => {
    const candidate = make_version();
    candidate.document.status = "needs_review";

    expect(() => to_practice_score(candidate)).toThrow(/只有已发布/u);

    const missing_review = make_version();
    missing_review.document.review.published_at = null;
    expect(() => to_practice_score(missing_review)).toThrow(/缺少发布时间/u);

    const missing_version_time = make_version();
    delete missing_version_time.published_at;
    expect(() => to_practice_score(missing_version_time)).toThrow(/只有已发布/u);
  });
});

function make_version(): published_score_version {
  return {
    id: "hymn-371-v2",
    score_id: "hymn-371",
    source_sha256: "a".repeat(64),
    published_at: "2026-07-24T08:00:00.000Z",
    document: make_document(),
  };
}

function make_document(): score_document_v2 {
  return {
    schema_version: 2,
    id: "hymn-371",
    number: "371",
    title: "耶稣爱我",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status: "published",
    provenance: {
      kind: "pptx",
      source_id: "hymn-pptx-371",
      source_file: "371 耶稣爱我.pptx",
      source_sha256: "b".repeat(64),
      font_config_version: "font-v1",
      importer_version: "importer-v1",
      references: [],
    },
    lyrics: [],
    hand_positions: [
      position("position-1", "measure-1", "C4 Position", [60, 62, 64, 65, 67], "stay"),
      position("position-2", "measure-2", "D4 Position", [62, 64, 65, 67, 69], "move"),
    ],
    measures: [
      {
        id: "measure-1",
        number: "1",
        meter: { beats: 4, beat_unit: 4 },
        events: [
          event("right-1", 1, 1, "right", 64, 3, "C"),
          event("left-1", 1, 2, "left", 48, 5, "C"),
        ],
      },
      {
        id: "measure-2",
        number: "2",
        meter: { beats: 3, beat_unit: 4 },
        events: [
          event("right-2", 0, 1, "right", 67, undefined, "G"),
        ],
      },
    ],
    review: {
      reviewed_by: "reviewer",
      reviewed_at: "2026-07-24T07:00:00.000Z",
      published_by: "publisher",
      published_at: "2026-07-24T08:00:00.000Z",
      note: null,
    },
  };
}

function event(
  id: string,
  onset_beats: number,
  duration_beats: number,
  hand: "left" | "right",
  midi: number,
  finger: 1 | 2 | 3 | 4 | 5 | undefined,
  chord: string,
) {
  return {
    id,
    onset_beats,
    duration_beats,
    hand,
    voice: hand === "left" ? 2 : 1,
    notes: [{
      id: `${id}-note`,
      midi,
      finger,
      fingering: finger ? annotation("manual", "人工确认指法") : undefined,
      source_refs: [],
    }],
    chord,
    chord_annotation: annotation("manual", "人工确认和弦"),
    source_refs: [],
  };
}

function position(
  id: string,
  measure_id: string,
  position_name: string,
  covered_midis: number[],
  movement: "stay" | "move" | "return",
) {
  return {
    id,
    hand: "right" as const,
    range: {
      start: { measure_id, beat: 0 },
      end: { measure_id, beat: 4 },
    },
    position_name,
    covered_midis,
    finger_map: covered_midis.map((midi, index) => ({
      midi,
      finger: (index + 1) as 1 | 2 | 3 | 4 | 5,
    })),
    movement,
    annotation: annotation("generated", "依据调性和相邻小节音域生成。"),
  };
}

function annotation(
  source: score_annotation["source"],
  reason: string,
): score_annotation {
  return {
    source,
    status: "confirmed",
    reason,
    confirmed_by: "reviewer",
    confirmed_at: "2026-07-24T07:00:00.000Z",
    source_refs: [],
  };
}
