import type {
  expected_step,
  note_fingering,
} from "./types";

interface fingering_options {
  tonic_midi?: number;
}

interface note_entry {
  note: number;
  original_index: number;
  fingering?: note_fingering;
}

export function apply_step_fingerings(
  steps: expected_step[],
  options: fingering_options = {},
): expected_step[] {
  const tonic_midi = options.tonic_midi ?? 60;
  const contexts = build_contexts(steps);

  return steps.map((step) => {
    if (has_complete_step_fingerings(step)) {
      return step;
    }
    const inferred_fingerings = infer_step_fingerings(step, contexts, tonic_midi);
    return {
      ...step,
      fingerings: merge_step_fingerings(step, inferred_fingerings),
    };
  });
}

function has_complete_step_fingerings(step: expected_step): boolean {
  return step.fingerings?.length === step.notes.length &&
    step.fingerings.every((fingering) => step.notes.includes(fingering.note));
}

function merge_step_fingerings(
  step: expected_step,
  inferred_fingerings: note_fingering[],
): note_fingering[] {
  const existing = step.fingerings ?? [];
  if (existing.length === 0) {
    return inferred_fingerings;
  }

  const used = new Set<number>();
  return step.notes.map((note, index) => {
    const exact_index = existing.findIndex((fingering, fingering_index) =>
      !used.has(fingering_index) && fingering.note === note);
    if (exact_index >= 0) {
      used.add(exact_index);
      return existing[exact_index];
    }
    return inferred_fingerings[index] ?? inferred_fingerings.at(-1)!;
  });
}

export function get_step_hand_fingerings(
  step: expected_step,
  hand: "right" | "left",
  notes: number[],
): Array<note_fingering | undefined> {
  const available = [...(step.fingerings ?? [])].filter((fingering) => fingering.hand === hand);
  const used = new Set<number>();

  return notes.map((note) => {
    const exact_index = available.findIndex((fingering, index) =>
      !used.has(index) && fingering.note === note);
    const fallback_index = exact_index >= 0
      ? exact_index
      : available.findIndex((_, index) => !used.has(index));
    if (fallback_index < 0) {
      return undefined;
    }
    used.add(fallback_index);
    return available[fallback_index];
  });
}

export function format_step_fingerings(step: expected_step): string {
  if ((step.fingerings?.length ?? 0) === 0) {
    return "";
  }
  const right = (step.fingerings ?? [])
    .filter((fingering) => fingering.hand === "right")
    .map((fingering) => fingering.finger);
  const left = (step.fingerings ?? [])
    .filter((fingering) => fingering.hand === "left")
    .map((fingering) => fingering.finger);
  if (right.length > 0 && left.length > 0) {
    return `右 ${right.join("-")} / 左 ${left.join("-")}`;
  }
  if (right.length > 0) {
    return `右 ${right.join("-")}`;
  }
  return `左 ${left.join("-")}`;
}

function build_contexts(steps: expected_step[]) {
  const right_single_notes = steps
    .filter((step) => step.hand === "right" && step.notes.length === 1)
    .flatMap((step) => step.notes);
  const left_single_notes = steps
    .filter((step) => step.hand === "left" && step.notes.length === 1)
    .flatMap((step) => step.notes);

  return {
    right_position: build_position_map(right_single_notes, "right"),
    left_position: build_position_map(left_single_notes, "left"),
  };
}

function build_position_map(
  notes: number[],
  hand: "right" | "left",
): Map<number, note_fingering["finger"]> | undefined {
  const unique_notes = Array.from(new Set(notes)).sort((left, right) => left - right);
  if (unique_notes.length < 2 || unique_notes.length > 5) {
    return undefined;
  }
  if (unique_notes.at(-1)! - unique_notes[0] > 7) {
    return undefined;
  }

  return new Map(unique_notes.map((note, index) => [
    note,
    to_finger(hand === "right" ? index + 1 : 5 - index),
  ]));
}

function infer_step_fingerings(
  step: expected_step,
  contexts: ReturnType<typeof build_contexts>,
  tonic_midi: number,
): note_fingering[] {
  const explicit_finger = parse_explicit_finger(step.notation);
  if (explicit_finger) {
    return assign_explicit_finger(step, explicit_finger);
  }
  return infer_note_fingerings(
    step.notes,
    step.hand,
    {
      tonic_midi,
      right_position: contexts.right_position,
      left_position: contexts.left_position,
    },
  );
}

export function infer_note_fingerings(
  notes: number[],
  hand: expected_step["hand"],
  options: fingering_options & {
    right_position?: Map<number, note_fingering["finger"]>;
    left_position?: Map<number, note_fingering["finger"]>;
  } = {},
): note_fingering[] {
  const tonic_midi = options.tonic_midi ?? 60;
  if (hand === "right") {
    return assign_hand_fingerings(
      notes,
      "right",
      options.right_position,
      tonic_midi,
    );
  }
  if (hand === "left") {
    return assign_hand_fingerings(
      notes,
      "left",
      options.left_position,
      tonic_midi,
    );
  }

  const split = split_both_hand_entries(notes);
  return [
    ...assign_hand_entries(split.left, "left", undefined, tonic_midi),
    ...assign_hand_entries(split.right, "right", undefined, tonic_midi),
  ].sort((left, right) =>
    notes.indexOf(left.note) - notes.indexOf(right.note));
}

function assign_explicit_finger(
  step: expected_step,
  finger: note_fingering["finger"],
): note_fingering[] {
  if (step.hand === "both") {
    const split = split_both_hand_entries(step.notes);
    return [
      ...split.left.map((entry) => make_fingering(entry.note, "left", finger, "score")),
      ...split.right.map((entry) => make_fingering(entry.note, "right", finger, "score")),
    ];
  }

  const hand = step.hand === "left" ? "left" : "right";
  return step.notes.map((note) => make_fingering(note, hand, finger, "score"));
}

function assign_hand_fingerings(
  notes: number[],
  hand: "right" | "left",
  position_map: Map<number, note_fingering["finger"]> | undefined,
  tonic_midi: number,
): note_fingering[] {
  const entries = notes.map((note, index) => ({ note, original_index: index }));
  return assign_hand_entries(entries, hand, position_map, tonic_midi);
}

function assign_hand_entries(
  entries: note_entry[],
  hand: "right" | "left",
  position_map: Map<number, note_fingering["finger"]> | undefined,
  tonic_midi: number,
): note_fingering[] {
  if (entries.length === 0) {
    return [];
  }
  if (entries.length > 1) {
    return assign_chord_fingerings(entries, hand);
  }

  const note = entries[0].note;
  const position_finger = position_map?.get(note);
  const finger = position_finger ??
    (hand === "right"
      ? right_finger_for_note(note, tonic_midi)
      : left_finger_for_note(note, tonic_midi));
  return [make_fingering(note, hand, finger, "generated")];
}

function assign_chord_fingerings(
  entries: note_entry[],
  hand: "right" | "left",
): note_fingering[] {
  const sorted = [...entries].sort((left, right) => left.note - right.note);
  const pattern = get_chord_pattern(sorted.length, hand);
  return sorted
    .map((entry, index) =>
      make_fingering(entry.note, hand, pattern[index] ?? pattern.at(-1)!, "generated"))
    .sort((left, right) =>
      entries.findIndex((entry) => entry.note === left.note) -
      entries.findIndex((entry) => entry.note === right.note));
}

function get_chord_pattern(
  count: number,
  hand: "right" | "left",
): note_fingering["finger"][] {
  if (hand === "left") {
    if (count <= 2) {
      return [5, 1];
    }
    if (count === 3) {
      return [5, 3, 1];
    }
    return [5, 4, 2, 1, 1];
  }
  if (count <= 2) {
    return [1, 5];
  }
  if (count === 3) {
    return [1, 3, 5];
  }
  return [1, 2, 3, 5, 5];
}

function split_both_hand_entries(notes: number[]): {
  left: note_entry[];
  right: note_entry[];
} {
  const entries = notes.map((note, original_index) => ({ note, original_index }));
  if (entries.length <= 1) {
    return { left: [], right: entries };
  }
  const sorted = [...entries].sort((left, right) => left.note - right.note);
  return {
    left: sorted.slice(0, -1),
    right: sorted.slice(-1),
  };
}

function parse_explicit_finger(notation: string): note_fingering["finger"] | undefined {
  const match = notation.match(/([1-5])\s*指/);
  return match ? to_finger(Number(match[1])) : undefined;
}

function right_finger_for_note(
  note: number,
  tonic_midi: number,
): note_fingering["finger"] {
  const normalized = normalize_interval(note - tonic_midi);
  const octave = Math.floor((note - tonic_midi) / 12);
  if (normalized === 0 && octave > 0) {
    return 5;
  }
  const map = new Map<number, note_fingering["finger"]>([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 1],
    [6, 1],
    [7, 2],
    [8, 2],
    [9, 3],
    [10, 3],
    [11, 4],
  ]);
  return map.get(normalized) ?? 3;
}

function left_finger_for_note(
  note: number,
  tonic_midi: number,
): note_fingering["finger"] {
  const normalized = normalize_interval(note - (tonic_midi - 12));
  const map = new Map<number, note_fingering["finger"]>([
    [0, 5],
    [1, 5],
    [2, 4],
    [3, 4],
    [4, 3],
    [5, 2],
    [6, 2],
    [7, 1],
    [8, 1],
    [9, 3],
    [10, 3],
    [11, 2],
  ]);
  return map.get(normalized) ?? 3;
}

function make_fingering(
  note: number,
  hand: "right" | "left",
  finger: note_fingering["finger"],
  source: note_fingering["source"],
): note_fingering {
  return { note, hand, finger, source };
}

function normalize_interval(value: number): number {
  return ((value % 12) + 12) % 12;
}

function to_finger(value: number): note_fingering["finger"] {
  return Math.min(5, Math.max(1, value)) as note_fingering["finger"];
}
