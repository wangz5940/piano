import assert from "node:assert/strict";
import test from "node:test";
import { score_document_to_jianpu_score } from "./app.mjs";

test("jianpu export retains measure signatures, repeated bar numbers and explicit rests", () => {
  const output = score_document_to_jianpu_score({
    key_signature: "C major", tonic_midi: 60, time_signature: "4/4",
    measures: [
      { number: "1", meter: { beats: 4, beat_unit: 4 }, events: [] },
      {
        number: "1", meter: { beats: 3, beat_unit: 4 },
        key_signature: "G major", tonic_midi: 67,
        events: [
          { id: "r", hand: "right", onset_beats: 0, duration_beats: 3, notes: [{ midi: 67 }] },
          { id: "l", hand: "left", onset_beats: 0, duration_beats: 3, notes: [] },
        ],
      },
    ],
  }, "test");
  assert.deepEqual(output.measures.map((measure) => measure.index), [1, 2]);
  assert.deepEqual(output.measures[1].meter, { beats: 3, beat_unit: 4 });
  assert.equal(output.measures[1].tonic_midi, 67);
  assert.equal(output.measures[1].key_signature, "G major");
  assert.equal(output.measures[1].events[0].left_rest, true);
  assert.deepEqual(output.measures[1].events[0].right_notes, [67]);
});
