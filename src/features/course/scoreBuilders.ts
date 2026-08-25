import type { expected_step, hand_mode, note_fingering } from "./types";

export interface note_seed {
  notation: string;
  notes: number[];
  hand: hand_mode;
  onset_beats?: number;
  allow_cross_measure?: boolean;
  duration_beats?: number;
  fingerings?: note_fingering[];
  held_hands?: Array<"right" | "left">;
}

export interface textbook_measure_seed {
  measure_index: number;
  events: note_seed[];
}

export function note_name(midi: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function score_fingering(
  note: number,
  hand: note_fingering["hand"],
  finger: note_fingering["finger"],
): note_fingering {
  return {
    note,
    hand,
    finger,
    source: "score",
  };
}

export function right_hand_seed(
  notation: string,
  note: number,
  finger: note_fingering["finger"],
  duration_beats = 1,
): note_seed {
  return {
    notation,
    notes: [note],
    hand: "right",
    duration_beats,
    fingerings: [score_fingering(note, "right", finger)],
  };
}

export function left_hand_seed(
  notation: string,
  notes: Array<[number, note_fingering["finger"]]>,
  duration_beats = 1,
  held_hands?: Array<"right" | "left">,
): note_seed {
  return {
    notation,
    notes: notes.map(([note]) => note),
    hand: "left",
    duration_beats,
    fingerings: notes.map(([note, finger]) => score_fingering(note, "left", finger)),
    held_hands,
  };
}

export function both_hands_seed(
  notation: string,
  right: [number, note_fingering["finger"]],
  left: Array<[number, note_fingering["finger"]]>,
  duration_beats = 1,
): note_seed {
  return {
    notation,
    notes: [...left.map(([note]) => note), right[0]],
    hand: "both",
    duration_beats,
    fingerings: [
      ...left.map(([note, finger]) => score_fingering(note, "left", finger)),
      score_fingering(right[0], "right", right[1]),
    ],
  };
}

export function make_steps(prefix: string, seeds: note_seed[]): expected_step[] {
  return make_metered_steps(prefix, seeds, 4);
}

export function make_metered_steps(
  prefix: string,
  seeds: note_seed[],
  beats_per_measure: number,
): expected_step[] {
  let beat_index = 0;

  return seeds.map((seed, index) => {
    const duration_beats = seed.duration_beats ?? 1;
    const step: expected_step = {
      id: `${prefix}-${index + 1}`,
      measure_index: Math.floor(beat_index / beats_per_measure) + 1,
      beat_index,
      notation: seed.notation,
      note_names: seed.notes.map(note_name),
      notes: seed.notes,
      fingerings: seed.fingerings,
      held_hands: seed.held_hands,
      hand: seed.hand,
      duration_beats,
      match_mode: seed.notes.length > 1 ? "chord" : "single_note",
    };
    beat_index += duration_beats;
    return step;
  });
}

export function make_textbook_steps(
  prefix: string,
  measure_seeds: textbook_measure_seed[],
): expected_step[] {
  const first_measure = measure_seeds[0]?.measure_index ?? 1;

  return measure_seeds.flatMap((measure_seed) => {
    let onset_beats = 0;

    return measure_seed.events.map((seed, event_index) => {
      const duration_beats = seed.duration_beats ?? 1;
      const step: expected_step = {
        id: `${prefix}-m${measure_seed.measure_index}-e${event_index + 1}`,
        measure_index: measure_seed.measure_index,
        beat_index: (measure_seed.measure_index - first_measure) * 4 + onset_beats,
        notation: seed.notation,
        note_names: seed.notes.map(note_name),
        notes: seed.notes,
        fingerings: seed.fingerings,
        held_hands: seed.held_hands,
        hand: seed.hand,
        duration_beats,
        match_mode: seed.notes.length > 1 ? "chord" : "single_note",
      };
      onset_beats += duration_beats;
      return step;
    });
  });
}

export function make_measure_steps(
  prefix: string,
  measures: note_seed[][],
  beats_per_measure: number,
): expected_step[] {
  for (const [measure_index, measure] of measures.entries()) {
    const duration = measure.reduce(
      (total, seed) => total + (seed.duration_beats ?? 1),
      0,
    );
    if (duration !== beats_per_measure) {
      throw new Error(`${prefix} 第 ${measure_index + 1} 小节时值不完整`);
    }
  }

  let beat_index = 0;
  return measures.flatMap((measure, measure_index) =>
    measure.map((seed, event_index) => {
      const duration_beats = seed.duration_beats ?? 1;
      const beat_in_measure = beat_index % beats_per_measure;
      const step: expected_step = {
        id: `${prefix}-m${measure_index + 1}-e${event_index + 1}`,
        measure_index: measure_index + 1,
        beat_index,
        beat_in_measure,
        notation: seed.notation,
        note_names: seed.notes.map(note_name),
        notes: seed.notes,
        fingerings: seed.fingerings,
        held_hands: seed.held_hands,
        hand: seed.hand,
        duration_beats,
        match_mode: seed.notes.length > 1 ? "chord" : "single_note",
      };
      beat_index += duration_beats;
      return step;
    }),
  );
}

export function make_variable_measure_steps(
  prefix: string,
  measures: note_seed[][],
  measure_beats: number[],
): expected_step[] {
  let beat_index = 0;

  return measures.flatMap((measure, measure_index) => {
    const beats = measure_beats[measure_index] ?? measure_beats.at(-1) ?? 4;
    let previous_onset = 0;
    const steps: expected_step[] = measure.map((seed, event_index) => {
      const duration_beats = seed.duration_beats ?? 1;
      const beat_in_measure = seed.onset_beats ?? previous_onset;
      if (beat_in_measure + 0.0001 < previous_onset ||
        (!seed.allow_cross_measure &&
          beat_in_measure + duration_beats > beats + 0.0001)) {
        throw new Error(`${prefix} 第 ${measure_index + 1} 小节时值或起拍位置不合法`);
      }

      previous_onset = beat_in_measure + duration_beats;
      const step: expected_step = {
        id: `${prefix}-m${measure_index + 1}-e${event_index + 1}`,
        measure_index: measure_index + 1,
        beat_index: beat_index + beat_in_measure,
        beat_in_measure,
        notation: seed.notation,
        note_names: seed.notes.map(note_name),
        notes: seed.notes,
        fingerings: seed.fingerings,
        held_hands: seed.held_hands,
        hand: seed.hand,
        duration_beats,
        match_mode: seed.notes.length > 1 ? "chord" : "single_note",
      };
      return step;
    });

    beat_index += beats;
    return steps;
  });
}

export function make_piece_steps(
  prefix: string,
  beats_per_measure: number,
  measures: note_seed[][],
): expected_step[] {
  return make_metered_steps(prefix, measures.flat(), beats_per_measure);
}
