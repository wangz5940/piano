import { get_step_hand_fingerings } from "@/features/course/fingerings";
import type {
  expected_step,
  note_fingering,
  practice_score,
} from "@/features/course/types";
import { note_name } from "@/features/course/scoreBuilders";

import type {
  jianpu_hand_position_label,
  jianpu_hand,
  jianpu_meter,
  jianpu_render_hand_event,
  jianpu_render_measure,
  jianpu_render_note,
  jianpu_render_score,
} from "./model";
import { parse_jianpu_meter } from "./meter";
import {
  get_accidental_preference,
  get_scale_intervals,
  midi_to_jianpu_note,
} from "./pitch";
import { validate_render_score } from "./validate";

interface indexed_step {
  step: expected_step;
  step_index: number;
}

export function to_render_score_from_practice_score(
  score: practice_score,
): jianpu_render_score {
  const default_meter = parse_jianpu_meter(
    score.time_signature,
    score.beats_per_measure,
  );
  const scale_intervals = get_scale_intervals(score.key_signature);
  const accidental_preference = get_accidental_preference(score.key_signature);
  const groups = group_steps(score.steps);
  const first_measure_index = Math.min(...groups.keys());
  const render_score: jianpu_render_score = {
    id: score.id,
    title: score.title,
    key_signature: score.key_signature,
    tonic_midi: score.jianpu_tonic_midi,
    scale_intervals,
    accidental_preference,
    time_signature: score.time_signature,
    measures: Array.from(groups.entries()).map(([source_measure_index, steps], index) => {
      const normalized_index = Number.isFinite(first_measure_index)
        ? source_measure_index - first_measure_index
        : index;
      const meter = get_measure_meter(score, normalized_index, default_meter);
      return normalize_measure(
        score,
        source_measure_index,
        normalized_index,
        steps,
        meter,
        scale_intervals,
        accidental_preference,
      );
    }),
  };
  return validate_render_score(render_score);
}

function group_steps(steps: expected_step[]): Map<number, indexed_step[]> {
  const groups = new Map<number, indexed_step[]>();
  steps.forEach((step, step_index) => {
    const current = groups.get(step.measure_index) ?? [];
    current.push({ step, step_index });
    groups.set(step.measure_index, current);
  });
  return new Map([...groups.entries()].sort(([left], [right]) => left - right));
}

function normalize_measure(
  score: practice_score,
  source_measure_index: number,
  normalized_index: number,
  steps: indexed_step[],
  meter: jianpu_meter,
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
): jianpu_render_measure {
  const right: jianpu_render_hand_event[] = [];
  const left: jianpu_render_hand_event[] = [];
  let content_beats = 0;

  steps.forEach(({ step, step_index }, event_index) => {
    const onset_beats = get_step_onset(step, meter.beats);
    const split = split_hand_notes(step);
    append_note_event(
      right,
      score,
      step,
      step_index,
      event_index,
      "right",
      split.right_notes,
      onset_beats,
      scale_intervals,
      accidental_preference,
    );
    append_note_event(
      left,
      score,
      step,
      step_index,
      event_index,
      "left",
      split.left_notes,
      onset_beats,
      scale_intervals,
      accidental_preference,
    );
    for (const hand of step.held_hands ?? []) {
      const target = hand === "right" ? right : left;
      target.push({
        id: `${step.id}-${hand}-sustain`,
        hand,
        kind: "sustain",
        onset_beats,
        duration_beats: step.duration_beats,
        notes: [],
        source_ref: {
          source: "practice_score",
          source_id: step.id,
          event_index,
          step_index,
        },
      });
    }
    content_beats = Math.max(
      content_beats,
      onset_beats + step.duration_beats,
    );
  });

  return {
    id: `${score.id}-measure-${normalized_index}`,
    index: normalized_index,
    number: String(normalized_index + 1),
    directions: [],
    meter,
    content_beats,
    warnings: [],
    hand_position: get_measure_hand_position(score, source_measure_index, steps),
    right: sort_events(right),
    left: sort_events(left),
    lyric_labels: [],
    chord_labels: steps.flatMap(({ step }, event_index) => {
      const label = get_chord_label(step);
      return label
        ? [{
            id: `${score.id}-m${normalized_index}-chord-${event_index}`,
            onset_beats: get_step_onset(step, meter.beats),
            text: label,
          }]
        : [];
    }),
  };
}

function get_measure_hand_position(
  score: practice_score,
  source_measure_index: number,
  steps: indexed_step[],
): jianpu_hand_position_label | undefined {
  const selected = select_hand_position(score, steps);
  if (!selected) {
    return undefined;
  }
  const previous_steps = score.steps
    .filter((step) => step.measure_index === source_measure_index - 1)
    .map((step, step_index) => ({ step, step_index }));
  const previous = previous_steps.length > 0
    ? select_hand_position(score, previous_steps)
    : undefined;
  const movement = get_position_movement(score, selected.label, previous?.label);
  return {
    label: selected.label,
    notes: selected.notes,
    fingers: selected.fingers,
    movement,
    reason: selected.reason,
  };
}

function select_hand_position(
  score: practice_score,
  steps: indexed_step[],
): practice_score["finger_guide"]["position_map"][number] | undefined {
  const positions = score.finger_guide.position_map;
  if (positions.length === 0) {
    return undefined;
  }
  const right_notes = steps.flatMap(({ step }) =>
    get_right_hand_notes(step));
  return select_position_for_notes(positions, right_notes);
}

function select_position_for_notes(
  positions: practice_score["finger_guide"]["position_map"],
  notes: number[],
): practice_score["finger_guide"]["position_map"][number] {
  const note_names = notes.map(note_name);
  const primary = positions[0];
  const has_note_outside_primary = note_names.some((name) =>
    !primary.notes.includes(name));
  if (has_note_outside_primary) {
    const shifted = positions.slice(1).find((position) =>
      note_names.some((name) => position.notes.includes(name)));
    if (shifted) {
      return shifted;
    }
  }
  return positions.find((position) =>
    note_names.some((name) => position.notes.includes(name))) ??
    primary;
}

function get_right_hand_notes(step: expected_step): number[] {
  if (step.hand === "right") {
    return step.notes;
  }
  if (step.hand === "left") {
    return [];
  }
  if (step.fingerings?.length === step.notes.length) {
    return step.fingerings
      .filter((fingering) => fingering.hand === "right")
      .map((fingering) => fingering.note);
  }
  return step.notes.length > 0 ? [Math.max(...step.notes)] : [];
}

function get_position_movement(
  score: practice_score,
  label: string,
  previous_label: string | undefined,
): jianpu_hand_position_label["movement"] {
  if (!previous_label) {
    return label === score.finger_guide.position_map[0]?.label ? "stay" : "move";
  }
  if (previous_label === label) {
    return "stay";
  }
  return label === score.finger_guide.position_map[0]?.label ? "return" : "move";
}

function append_note_event(
  target: jianpu_render_hand_event[],
  score: practice_score,
  step: expected_step,
  step_index: number,
  event_index: number,
  hand: jianpu_hand,
  notes: number[],
  onset_beats: number,
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
): void {
  if (notes.length === 0) {
    return;
  }
  const fingerings = get_step_hand_fingerings(step, hand, notes);
  target.push({
    id: `${step.id}-${hand}`,
    hand,
    kind: "note",
    onset_beats,
    duration_beats: step.duration_beats,
    notes: notes.map((midi, index) =>
      attach_fingering(
        midi_to_jianpu_note(
          midi,
          score.jianpu_tonic_midi,
          scale_intervals,
          accidental_preference,
        ),
        fingerings[index],
      )),
    source_ref: {
      source: "practice_score",
      source_id: step.id,
      event_index,
      step_index,
    },
  });
}

function attach_fingering(
  note: jianpu_render_note,
  fingering: note_fingering | undefined,
): jianpu_render_note {
  return fingering ? { ...note, finger: fingering.finger } : note;
}

function split_hand_notes(
  step: expected_step,
): { right_notes: number[]; left_notes: number[] } {
  if (step.hand === "right") {
    return { right_notes: step.notes, left_notes: [] };
  }
  if (step.hand === "left") {
    return { right_notes: [], left_notes: step.notes };
  }
  if (step.fingerings?.length === step.notes.length) {
    return {
      right_notes: step.fingerings
        .filter((fingering) => fingering.hand === "right")
        .map((fingering) => fingering.note),
      left_notes: step.fingerings
        .filter((fingering) => fingering.hand === "left")
        .map((fingering) => fingering.note),
    };
  }

  const sorted_notes = [...step.notes].sort((left, right) => left - right);
  return {
    right_notes: sorted_notes.length > 0 ? [sorted_notes.at(-1)!] : [],
    left_notes: sorted_notes.slice(0, -1),
  };
}

function get_measure_meter(
  score: practice_score,
  measure_index: number,
  default_meter: jianpu_meter,
): jianpu_meter {
  return {
    beats: score.measure_beats?.[measure_index] ?? default_meter.beats,
    beat_unit: score.measure_beat_units?.[measure_index] ?? default_meter.beat_unit,
  };
}

function get_step_onset(step: expected_step, beats_per_measure: number): number {
  if (step.beat_in_measure !== undefined) {
    return step.beat_in_measure;
  }
  return positive_modulo(step.beat_index, beats_per_measure);
}

function positive_modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function sort_events(
  events: jianpu_render_hand_event[],
): jianpu_render_hand_event[] {
  return events.sort((left, right) =>
    left.onset_beats - right.onset_beats ||
    (left.kind === "sustain" ? 1 : -1));
}

function get_chord_label(step: expected_step): string | undefined {
  if (step.notes.length < 2) {
    return undefined;
  }
  const match = step.notation.match(/左\s+([A-G](?:\s*低音)?)|^([A-G])(?:\s|$)/);
  return match?.[1]?.replace(" 低音", "") ?? match?.[2];
}
