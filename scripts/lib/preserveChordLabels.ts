import type { jianpu_event, jianpu_score } from "../../src/features/jianpu/types.ts";
import type { score_document } from "../../src/features/score/types.ts";

/** Retain an existing label only when bar occurrence, timing and both hands'
 * pitches still match. A previous label is evidence, not new confirmation. */
export function preserve_chord_labels(
  document: score_document,
  before: jianpu_score,
  after: jianpu_score,
): void {
  const occurrences = new Map<string, number>();
  const prior = new Map<string, typeof before.measures[number]>();
  for (const measure of before.measures) {
    const occurrence = occurrences.get(measure.number) ?? 0;
    occurrences.set(measure.number, occurrence + 1);
    prior.set(`${measure.number}:${occurrence}`, measure);
  }
  occurrences.clear();
  for (const [index, measure] of after.measures.entries()) {
    const occurrence = occurrences.get(measure.number) ?? 0;
    occurrences.set(measure.number, occurrence + 1);
    const original = prior.get(`${measure.number}:${occurrence}`);
    if (!original) continue;
    for (const event of measure.events) {
      const labels = new Set(original.events.filter((item) =>
        item.chord && key(item) === key(event)).map((item) => item.chord));
      if (labels.size !== 1) continue;
      const chord = [...labels][0]!;
      for (const target of document.measures[index].events.filter((item) =>
        Math.abs(item.onset_beats - event.onset_beats) < 1e-8 &&
        Math.abs(item.duration_beats - event.duration_beats) < 1e-8)) {
        target.chord = chord;
        target.chord_annotation = {
          source: "legacy", status: "needs_review",
          reason: "保留相同小节、时值与双手音高的既有和弦标签，未升级为人工确认。",
          confirmed_by: null, confirmed_at: null, source_refs: [],
        };
      }
    }
  }
}

function key(event: jianpu_event): string {
  return JSON.stringify([
    Number(event.onset_beats.toFixed(8)), Number(event.duration_beats.toFixed(8)),
    [...event.right_notes].sort((a, b) => a - b),
    [...event.left_notes].sort((a, b) => a - b),
  ]);
}
