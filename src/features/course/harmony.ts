import { apply_step_fingerings } from "./fingerings";
import { make_metered_steps, note_name, type note_seed } from "./scoreBuilders";
import type { expected_step } from "./types";

export type chord_symbol =
  | "A"
  | "Bm"
  | "C"
  | "Dm"
  | "D"
  | "E"
  | "Em"
  | "F"
  | "G"
  | "Am";

export type accompaniment_style =
  | "none"
  | "root"
  | "block"
  | "bass_chord"
  | "broken";

export interface melody_degree {
  degree: number;
  duration_beats?: number;
}

export interface harmonized_measure {
  chord: chord_symbol;
  melody: melody_degree[];
}

export interface harmonize_options {
  prefix: string;
  key_tonic_midi: number;
  scale_intervals: readonly number[];
  beats_per_measure: number;
  measures: harmonized_measure[];
  style: accompaniment_style;
}

const chord_roots: Record<chord_symbol, number> = {
  A: 45,
  Bm: 47,
  C: 48,
  Dm: 50,
  D: 50,
  E: 52,
  Em: 52,
  F: 41,
  G: 43,
  Am: 45,
};

const minor_chords = new Set<chord_symbol>(["Bm", "Dm", "Em", "Am"]);

export function chord_notes(symbol: chord_symbol): number[] {
  const root = chord_roots[symbol];
  const third = minor_chords.has(symbol) ? 3 : 4;
  return [root, root + third, root + 7];
}

export function build_right_hand_melody({
  prefix,
  key_tonic_midi,
  scale_intervals,
  beats_per_measure,
  measures,
}: Omit<harmonize_options, "style">): expected_step[] {
  return apply_step_fingerings(
    make_metered_steps(
      `${prefix}-right`,
      measures.flatMap((measure) =>
        measure.melody.map((event) => ({
          notation: String(event.degree),
          notes: [degree_to_midi(event.degree, key_tonic_midi, scale_intervals)],
          hand: "right",
          duration_beats: event.duration_beats ?? 1,
        } satisfies note_seed))),
      beats_per_measure,
    ),
    { tonic_midi: key_tonic_midi },
  );
}

export function harmonize_right_hand_score({
  prefix,
  right_steps,
  chords,
  beats_per_measure,
  style,
  tonic_midi,
}: {
  prefix: string;
  right_steps: expected_step[];
  chords: chord_symbol[];
  beats_per_measure: number;
  style: accompaniment_style;
  tonic_midi: number;
}): expected_step[] {
  const harmonized = right_steps.map((step, index) => {
    const beat_in_measure = step.beat_in_measure ??
      step.beat_index % beats_per_measure;
    const chord = chords[(step.measure_index - 1) % chords.length];
    const left_notes = get_left_notes_for_beat(chord, style, beat_in_measure, beats_per_measure);
    const notes = left_notes.length > 0 ? [...left_notes, ...step.notes] : step.notes;

    return {
      ...step,
      id: `${prefix}-${index + 1}`,
      notation: left_notes.length > 0
        ? `左 ${left_notes.map(note_name).join("+")} + 右 ${step.notation}`
        : step.notation,
      note_names: notes.map(note_name),
      notes,
      hand: left_notes.length > 0 ? "both" : step.hand,
      match_mode: notes.length > 1 ? "chord" : "single_note",
    } satisfies expected_step;
  });

  return apply_step_fingerings(harmonized, { tonic_midi });
}

export function build_harmonized_score(options: harmonize_options): expected_step[] {
  const right_steps = build_right_hand_melody(options);
  return harmonize_right_hand_score({
    prefix: options.prefix,
    right_steps,
    chords: options.measures.map((measure) => measure.chord),
    beats_per_measure: options.beats_per_measure,
    style: options.style,
    tonic_midi: options.key_tonic_midi,
  });
}

export function get_left_notes_for_beat(
  symbol: chord_symbol,
  style: accompaniment_style,
  beat_in_measure: number,
  beats_per_measure: number,
): number[] {
  if (style === "none") {
    return [];
  }

  const chord = chord_notes(symbol);
  const whole_beat = Math.floor(beat_in_measure + 0.0001);
  if (style === "root") {
    return whole_beat === 0 ? [chord[0]] : [];
  }
  if (style === "block") {
    return whole_beat === 0 ? chord : [];
  }
  if (style === "bass_chord") {
    if (whole_beat === 0) {
      return [chord[0]];
    }
    return whole_beat === Math.floor(beats_per_measure / 2) ? chord : [];
  }

  const broken_pattern = [chord[0], chord[2], chord[1], chord[2]];
  return [broken_pattern[whole_beat % broken_pattern.length]];
}

function degree_to_midi(
  degree: number,
  tonic_midi: number,
  scale_intervals: readonly number[],
): number {
  const zero_based = degree - 1;
  const octave = Math.floor(zero_based / scale_intervals.length);
  const scale_index = ((zero_based % scale_intervals.length) + scale_intervals.length) %
    scale_intervals.length;
  return tonic_midi + octave * 12 + scale_intervals[scale_index];
}
