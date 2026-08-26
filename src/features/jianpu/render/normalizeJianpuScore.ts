import type {
  jianpu_event,
  jianpu_event_fingering,
  jianpu_measure,
  jianpu_score,
} from "@/features/jianpu/types";

import type {
  jianpu_hand,
  jianpu_render_hand_event,
  jianpu_render_measure,
  jianpu_render_score,
} from "./model";
import { parse_jianpu_meter } from "./meter";
import {
  get_accidental_preference,
  get_scale_intervals,
  midi_to_jianpu_note,
} from "./pitch";
import { validate_render_score } from "./validate";

export function to_render_score_from_jianpu_score(
  score: jianpu_score,
): jianpu_render_score {
  const meter = parse_jianpu_meter(score.time_signature);
  const scale_intervals = get_scale_intervals(score.key_signature);
  const accidental_preference = get_accidental_preference(score.key_signature);
  const render_score: jianpu_render_score = {
    id: score.segment_id,
    key_signature: score.key_signature,
    tonic_midi: score.tonic_midi,
    scale_intervals,
    accidental_preference,
    time_signature: score.time_signature,
    measures: score.measures.map((measure) =>
      normalize_measure(
        score,
        measure,
        meter,
        scale_intervals,
        accidental_preference,
      )),
  };
  return validate_render_score(render_score);
}

function normalize_measure(
  score: jianpu_score,
  measure: jianpu_measure,
  meter: ReturnType<typeof parse_jianpu_meter>,
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
): jianpu_render_measure {
  const right: jianpu_render_hand_event[] = [];
  const left: jianpu_render_hand_event[] = [];

  measure.events.forEach((event, event_index) => {
    append_hand_event(
      right,
      "right",
      event,
      event.right_notes,
      event.right_fingerings ?? [],
      event.right_slur,
      score,
      measure,
      event_index,
      scale_intervals,
      accidental_preference,
    );
    append_hand_event(
      left,
      "left",
      event,
      event.left_notes,
      event.left_fingerings ?? [],
      event.left_slur,
      score,
      measure,
      event_index,
      scale_intervals,
      accidental_preference,
    );
  });

  return {
    id: `${score.segment_id}-measure-${measure.index}`,
    index: measure.index,
    number: measure.number,
    directions: measure.directions,
    meter,
    content_beats: get_content_beats(measure.events),
    warnings: [],
    right,
    left,
    lyric_labels: [],
    chord_labels: measure.events.flatMap((event, event_index) =>
      event.chord
        ? [{
            id: `${score.segment_id}-m${measure.index}-chord-${event_index}`,
            onset_beats: event.onset_beats,
            text: event.chord,
          }]
        : []),
  };
}

function append_hand_event(
  target: jianpu_render_hand_event[],
  hand: jianpu_hand,
  event: jianpu_event,
  notes: number[],
  fingerings: jianpu_event_fingering[],
  slur: jianpu_event["right_slur"],
  score: jianpu_score,
  measure: jianpu_measure,
  event_index: number,
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
): void {
  if (notes.length === 0) {
    return;
  }
  target.push({
    id: `${score.segment_id}-m${measure.index}-e${event_index}-${hand}`,
    hand,
    kind: "note",
    onset_beats: event.onset_beats,
    duration_beats: event.duration_beats,
    notes: notes.map((midi, note_index) => {
      const note = midi_to_jianpu_note(
        midi,
        score.tonic_midi,
        scale_intervals,
        accidental_preference,
      );
      const fingering = find_jianpu_fingering(fingerings, midi, note_index);
      return fingering ? { ...note, finger: fingering.finger } : note;
    }),
    markings: slur && slur !== "none" ? { slur } : undefined,
    source_ref: {
      source: "jianpu_score",
      source_id: `${score.segment_id}-m${measure.index}-e${event_index}`,
      event_index,
    },
  });
}

function find_jianpu_fingering(
  fingerings: jianpu_event_fingering[],
  midi: number,
  note_index: number,
): jianpu_event_fingering | undefined {
  return fingerings.find((fingering) => fingering.note === midi) ??
    fingerings[note_index];
}

function get_content_beats(events: jianpu_event[]): number {
  return events.reduce(
    (maximum, event) =>
      Math.max(maximum, event.onset_beats + event.duration_beats),
    0,
  );
}
