export type timing_label = "起拍" | "稳定" | "稍早" | "稍晚";

export interface input_evaluation {
  kind: "hit" | "partial" | "wrong";
  timing: timing_label;
  accepted_notes: number[];
}

export interface evaluation_input {
  expected_notes: number[];
  received_note: number;
  collected_notes: number[];
  collected_started_at?: number;
  expected_at?: number;
  timestamp: number;
  early_window_ms?: number;
  late_window_ms?: number;
  chord_window_ms?: number;
}

export function evaluate_input({
  expected_notes,
  received_note,
  collected_notes,
  collected_started_at,
  expected_at,
  timestamp,
  early_window_ms = 250,
  late_window_ms = 500,
  chord_window_ms = 250,
}: evaluation_input): input_evaluation {
  const active_collection =
    collected_started_at !== undefined &&
      timestamp - collected_started_at > chord_window_ms
      ? []
      : collected_notes;

  if (!expected_notes.includes(received_note)) {
    return {
      kind: "wrong",
      timing: get_timing_label(expected_at, timestamp, early_window_ms, late_window_ms),
      accepted_notes: [],
    };
  }

  const accepted_notes = Array.from(new Set([...active_collection, received_note]));
  const is_complete = expected_notes.every((note) => accepted_notes.includes(note));

  return {
    kind: is_complete ? "hit" : "partial",
    timing: get_timing_label(expected_at, timestamp, early_window_ms, late_window_ms),
    accepted_notes,
  };
}

export function get_timing_label(
  expected_at: number | undefined,
  timestamp: number,
  early_window_ms = 250,
  late_window_ms = 500,
): timing_label {
  if (expected_at === undefined) {
    return "起拍";
  }

  const offset = timestamp - expected_at;
  if (offset < -early_window_ms) {
    return "稍早";
  }

  if (offset > late_window_ms) {
    return "稍晚";
  }

  return "稳定";
}

export function get_beat_duration_ms(bpm: number): number {
  return 60_000 / bpm;
}

export function get_accuracy(correct_steps: number, mistakes: number): number {
  const attempts = correct_steps + mistakes;
  return attempts === 0 ? 0 : correct_steps / attempts;
}
