import { readFile, writeFile } from "node:fs/promises";

const scale_intervals = [0, 2, 4, 5, 7, 9, 11];
const finger_count = 5;
const default_reason = "校准台当前事件面板设置指法。";

function usage() {
  return [
    "Usage: node scripts/apply-score-fingerings.mjs <score-document.json> [--missing-only]",
    "",
    "Rules:",
    "  infer each hand's five-finger scale position from the score's notes",
    "  right hand ascending position notes -> fingers 1-5",
    "  left hand ascending position notes -> fingers 5-1",
  ].join("\n");
}

function is_finite_midi(value) {
  return Number.isFinite(value);
}

function unique_sorted(values) {
  return [...new Set(values.filter(is_finite_midi))].sort((left, right) => left - right);
}

function build_scale_midis(tonic_midi, min_midi, max_midi) {
  const notes = [];
  const min_octave = Math.floor((min_midi - tonic_midi) / 12) - 1;
  const max_octave = Math.ceil((max_midi - tonic_midi) / 12) + 1;
  for (let octave = min_octave; octave <= max_octave; octave += 1) {
    for (const interval of scale_intervals) {
      notes.push(tonic_midi + octave * 12 + interval);
    }
  }
  return unique_sorted(notes);
}

function distance_to_window(note, window) {
  return Math.min(...window.map((window_note) => Math.abs(window_note - note)));
}

function score_position_window(notes, window) {
  const exact_hits = notes.filter((note) => window.includes(note)).length;
  const distance = notes.reduce((sum, note) => sum + distance_to_window(note, window), 0);
  const outside_distance = notes.reduce((sum, note) => {
    if (note >= window[0] && note <= window.at(-1)) {
      return sum;
    }
    return sum + Math.min(Math.abs(note - window[0]), Math.abs(note - window.at(-1)));
  }, 0);
  return {
    exact_hits,
    distance,
    outside_distance,
  };
}

function compare_window_scores(left, right) {
  if (left.exact_hits !== right.exact_hits) {
    return right.exact_hits - left.exact_hits;
  }
  if (left.distance !== right.distance) {
    return left.distance - right.distance;
  }
  return left.outside_distance - right.outside_distance;
}

function infer_position(notes, hand, tonic_midi) {
  const unique_notes = unique_sorted(notes);
  if (unique_notes.length === 0) {
    return undefined;
  }

  const scale_notes = build_scale_midis(
    tonic_midi,
    unique_notes[0],
    unique_notes.at(-1),
  );
  const candidates = [];
  for (let index = 0; index <= scale_notes.length - finger_count; index += 1) {
    const window = scale_notes.slice(index, index + finger_count);
    const score = score_position_window(unique_notes, window);
    candidates.push({ window, score });
  }
  candidates.sort((left, right) => compare_window_scores(left.score, right.score));
  const best = candidates[0];
  if (!best) {
    return undefined;
  }

  return {
    hand,
    notes: best.window,
    exact_hits: best.score.exact_hits,
    map: new Map(best.window.map((note, index) => {
      const finger = hand === "left" ? finger_count - index : index + 1;
      return [note, finger];
    })),
  };
}

function nearest_position_finger(note, position) {
  const entries = [...position.map.entries()];
  const nearest = entries
    .map(([position_note, finger]) => ({
      position_note,
      finger,
      distance: Math.abs(position_note - note),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (!nearest || nearest.distance > 1) {
    return undefined;
  }
  return {
    finger: nearest.finger,
    position_note: nearest.position_note,
    distance: nearest.distance,
  };
}

function create_fingering() {
  return {
    source: "manual",
    status: "published",
    reason: default_reason,
    confirmed_by: null,
    confirmed_at: null,
    source_refs: [],
  };
}

function is_same_fingering(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collect_hand_notes(document) {
  const notes = {
    right: [],
    left: [],
  };
  for (const measure of document.measures ?? []) {
    for (const event of measure.events ?? []) {
      const hand = event.hand === "left" ? "left" : event.hand === "right" ? "right" : undefined;
      if (!hand) {
        continue;
      }
      for (const note of event.notes ?? []) {
        if (is_finite_midi(note.midi)) {
          notes[hand].push(note.midi);
        }
      }
    }
  }
  return notes;
}

function apply_score_fingerings(document, { missing_only = false } = {}) {
  const tonic_midi = Number.isFinite(document.tonic_midi) ? document.tonic_midi : 60;
  const hand_notes = collect_hand_notes(document);
  const positions = {
    right: infer_position(hand_notes.right, "right", tonic_midi),
    left: infer_position(hand_notes.left, "left", tonic_midi),
  };
  const summary = {
    score_id: document.id ?? null,
    tonic_midi,
    positions: {
      right: positions.right
        ? { notes: positions.right.notes, exact_hits: positions.right.exact_hits }
        : null,
      left: positions.left
        ? { notes: positions.left.notes, exact_hits: positions.left.exact_hits }
        : null,
    },
    notes: 0,
    changed: 0,
    skipped: [],
    approximated: [],
    by_hand: {
      right: {},
      left: {},
    },
  };

  for (const measure of document.measures ?? []) {
    for (const event of measure.events ?? []) {
      const hand = event.hand === "left" ? "left" : event.hand === "right" ? "right" : undefined;
      if (!hand) {
        continue;
      }
      for (const note of event.notes ?? []) {
        summary.notes += 1;
        const position = positions[hand];
        const exact_finger = position?.map.get(note.midi);
        const nearest = exact_finger === undefined && position
          ? nearest_position_finger(note.midi, position)
          : undefined;
        const finger = exact_finger ?? nearest?.finger;
        if (!finger) {
          summary.skipped.push({
            measure: measure.number ?? measure.id ?? null,
            event: event.id ?? null,
            note: note.id ?? null,
            hand,
            midi: note.midi,
          });
          continue;
        }
        if (nearest) {
          summary.approximated.push({
            measure: measure.number ?? measure.id ?? null,
            event: event.id ?? null,
            note: note.id ?? null,
            hand,
            midi: note.midi,
            position_note: nearest.position_note,
            distance: nearest.distance,
          });
        }
        summary.by_hand[hand][finger] = (summary.by_hand[hand][finger] ?? 0) + 1;
        if (missing_only && note.finger !== undefined && note.fingering) {
          continue;
        }
        const next_fingering = create_fingering();
        if (note.finger !== finger || !is_same_fingering(note.fingering, next_fingering)) {
          note.finger = finger;
          note.fingering = next_fingering;
          summary.changed += 1;
        }
      }
    }
  }

  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const file_path = args.find((arg) => !arg.startsWith("--"));
  if (!file_path || args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(file_path ? 0 : 1);
  }
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--missing-only");
  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown.join(", ")}`);
  }

  const source = await readFile(file_path, "utf8");
  const document = JSON.parse(source);
  const summary = apply_score_fingerings(document, {
    missing_only: args.includes("--missing-only"),
  });
  await writeFile(file_path, `${JSON.stringify(document, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.skipped.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
