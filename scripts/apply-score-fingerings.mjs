import { readFile, writeFile } from "node:fs/promises";

const degree_intervals = [0, 2, 4, 5, 7];
const default_reason = "校准台当前事件面板设置指法。";

function usage() {
  return [
    "Usage: node scripts/apply-score-fingerings.mjs <score-document.json> [--missing-only]",
    "",
    "Rules:",
    "  right hand scale degrees 1-5 -> fingers 1-5",
    "  left hand scale degrees 1-5 -> fingers 5-1",
  ].join("\n");
}

function normalize_pitch_class(value) {
  return ((value % 12) + 12) % 12;
}

function create_degree_map(tonic_midi, hand) {
  const tonic_pitch_class = normalize_pitch_class(tonic_midi);
  return new Map(degree_intervals.map((interval, index) => {
    const degree = index + 1;
    const finger = hand === "left" ? 6 - degree : degree;
    return [normalize_pitch_class(tonic_pitch_class + interval), finger];
  }));
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

function apply_score_fingerings(document, { missing_only = false } = {}) {
  const tonic_midi = Number.isFinite(document.tonic_midi) ? document.tonic_midi : 60;
  const maps = {
    right: create_degree_map(tonic_midi, "right"),
    left: create_degree_map(tonic_midi, "left"),
  };
  const summary = {
    score_id: document.id ?? null,
    tonic_midi,
    notes: 0,
    changed: 0,
    skipped: [],
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
        const finger = maps[hand].get(normalize_pitch_class(note.midi));
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
