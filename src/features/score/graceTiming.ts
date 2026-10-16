import type { score_document_event } from "./types";

/** Performance timing is derived; written grace notes retain zero duration.
 * Play short grace groups on the beat, borrowing at most 1/4 of the following
 * note and 1/8 quarter in total. Other voices keep their written onset.
 */
export function with_grace_performance_timing(
  events: score_document_event[],
  beat_unit: number,
): score_document_event[] {
  const result = events.map((event) => ({ ...event }));
  for (const principal of result) {
    if (principal.grace || !principal.notes.length) continue;
    const grace_notes = result.filter((event) => event.grace &&
      event.hand === principal.hand && event.voice === principal.voice &&
      event.onset_beats === principal.onset_beats);
    if (!grace_notes.length) continue;
    const borrowed = Math.min(principal.duration_beats / 4, beat_unit / 32);
    const start = principal.onset_beats;
    grace_notes.forEach((event, index) => {
      event.onset_beats = start + borrowed * index / grace_notes.length;
      event.duration_beats = borrowed / grace_notes.length;
    });
    principal.onset_beats += borrowed;
    principal.duration_beats -= borrowed;
  }
  return result;
}
