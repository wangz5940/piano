import type {
  jianpu_accidental,
  jianpu_render_note,
} from "./model";

export const major_scale_intervals = [0, 2, 4, 5, 7, 9, 11] as const;
export const natural_minor_scale_intervals = [0, 2, 3, 5, 7, 8, 10] as const;

const degree_names = ["1", "2", "3", "4", "5", "6", "7"] as const;
const midi_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function get_scale_intervals(key_signature: string): readonly number[] {
  return key_signature.includes("小调")
    ? natural_minor_scale_intervals
    : major_scale_intervals;
}

export function get_accidental_preference(
  key_signature: string,
): "sharp" | "flat" {
  const normalized = key_signature.replace(/\s+/g, "");
  return normalized.includes("降") ||
    normalized.includes("♭") ||
    /^(F|B[b♭]|E[b♭]|A[b♭]|D[b♭]|G[b♭])(大调|小调)/.test(normalized)
    ? "flat"
    : "sharp";
}

export function midi_to_jianpu_note(
  midi: number,
  tonic_midi: number,
  scale_intervals: readonly number[] = major_scale_intervals,
  accidental_preference: "sharp" | "flat" = "sharp",
): jianpu_render_note {
  const interval = positive_modulo(midi - tonic_midi, 12);
  const spelling = find_spelling(interval, scale_intervals, accidental_preference);

  return {
    midi,
    degree: degree_names[spelling.degree_index],
    accidental: spelling.accidental,
    octave_offset: Math.floor((midi - tonic_midi) / 12),
    keyboard_label: midi_to_name(midi),
  };
}

export function midi_to_name(midi: number): string {
  return `${midi_names[positive_modulo(midi, 12)]}${Math.floor(midi / 12) - 1}`;
}

export function get_duration_line_count(
  duration_beats: number,
  beat_unit: number,
): number {
  const quarter_units = duration_beats * 4 / beat_unit;
  if (quarter_units <= 0) {
    return 0;
  }
  const nominal_quarter_units = get_triplet_nominal_duration(quarter_units);
  if (nominal_quarter_units >= 1) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(3, Math.round(Math.log2(1 / nominal_quarter_units))),
  );
}

export function get_quarter_units(
  duration_beats: number,
  beat_unit: number,
): number {
  return duration_beats * 4 / beat_unit;
}

function find_spelling(
  interval: number,
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
): { degree_index: number; accidental: jianpu_accidental } {
  const candidates = scale_intervals.slice(0, 7).map((scale_interval, degree_index) => {
    const signed_distance = normalize_signed_distance(interval - scale_interval);
    return {
      degree_index,
      signed_distance,
      distance: Math.abs(signed_distance),
    };
  });
  const minimum_distance = Math.min(...candidates.map((candidate) => candidate.distance));
  const nearest = candidates.filter((candidate) => candidate.distance === minimum_distance);
  const preferred = nearest.find((candidate) =>
    accidental_preference === "flat"
      ? candidate.signed_distance < 0
      : candidate.signed_distance > 0,
  ) ?? nearest[0];

  return {
    degree_index: preferred.degree_index,
    accidental: distance_to_accidental(preferred.signed_distance),
  };
}

function distance_to_accidental(distance: number): jianpu_accidental {
  if (distance === 0) {
    return "";
  }
  return distance > 0 ? "#" : "b";
}

function normalize_signed_distance(value: number): number {
  const normalized = positive_modulo(value, 12);
  return normalized > 6 ? normalized - 12 : normalized;
}

function positive_modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function get_triplet_nominal_duration(quarter_units: number): number {
  const triplet_nominal = quarter_units * 3 / 2;
  const power = Math.log2(triplet_nominal);
  return Math.abs(power - Math.round(power)) < 0.002
    ? triplet_nominal
    : quarter_units;
}
