import { describe, expect, it } from "vitest";

import { migrate_score_document } from "./migration";
import type { score_document_v1 } from "./types";

const v1_document: score_document_v1 = {
  schema_version: 1,
  id: "score-legacy-hymn",
  title: "Legacy hymn",
  key_signature: "G major",
  tonic_midi: 67,
  time_signature: "3/4",
  measures: [{
    id: "measure-1",
    number: "1",
    meter: { beats: 3, beat_unit: 4 },
    events: [
      {
        id: "event-right",
        onset_beats: 0,
        duration_beats: 1.5,
        hand: "right",
        voice: 1,
        notes: [{ id: "note-right", midi: 69, finger: 3 }],
        chord: "G",
      },
      {
        id: "event-left",
        onset_beats: 1.5,
        duration_beats: 1.5,
        hand: "left",
        voice: 2,
        notes: [{ id: "note-left", midi: 43, finger: 5 }],
        chord: "D7",
      },
    ],
  }],
};

describe("migrate_score_document", () => {
  it("preserves v1 pitch, duration, hand, finger, and chord values", () => {
    const migrated = migrate_score_document(v1_document);
    const [right_event, left_event] = migrated.measures[0].events;

    expect(migrated.schema_version).toBe(2);
    expect(right_event).toMatchObject({
      duration_beats: 1.5,
      hand: "right",
      chord: "G",
      notes: [{ midi: 69, finger: 3 }],
    });
    expect(left_event).toMatchObject({
      duration_beats: 1.5,
      hand: "left",
      chord: "D7",
      notes: [{ midi: 43, finger: 5 }],
    });
    expect(right_event.notes[0].fingering).toMatchObject({
      source: "legacy",
      status: "needs_review",
    });
    expect(right_event.chord_annotation).toMatchObject({
      source: "legacy",
      status: "needs_review",
    });
    expect(migrated.provenance.kind).toBe("legacy");
    expect(migrated.lyrics).toEqual([]);
    expect(migrated.hand_positions).toEqual([]);
  });

  it("does not mutate v1 or v2 input documents", () => {
    const v1_snapshot = structuredClone(v1_document);
    const migrated = migrate_score_document(v1_document);
    const migrated_snapshot = structuredClone(migrated);
    const cloned_v2 = migrate_score_document(migrated);

    cloned_v2.measures[0].events[0].notes[0].midi = 72;

    expect(v1_document).toEqual(v1_snapshot);
    expect(migrated).toEqual(migrated_snapshot);
  });
});
