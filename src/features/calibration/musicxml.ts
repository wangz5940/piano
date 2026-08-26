import { XMLParser } from "fast-xml-parser";

import type {
  score_document,
  score_document_event,
  score_document_measure,
  score_document_note,
  score_hand,
} from "@/features/score";
import { create_imported_fingering_annotation } from "../score";

import type {
  calibration_event_metadata,
  calibration_work_metadata,
} from "./types";

type xml_node = Record<string, unknown>;

export interface musicxml_import_result {
  document: score_document;
  event_metadata: Record<string, calibration_event_metadata>;
}

const step_offsets: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const fifths_to_key = new Map<number, string>([
  [-7, "C♭ major"],
  [-6, "G♭ major"],
  [-5, "D♭ major"],
  [-4, "A♭ major"],
  [-3, "E♭ major"],
  [-2, "B♭ major"],
  [-1, "F major"],
  [0, "C major"],
  [1, "G major"],
  [2, "D major"],
  [3, "A major"],
  [4, "E major"],
  [5, "B major"],
  [6, "F♯ major"],
  [7, "C♯ major"],
]);

const key_to_tonic_midi = new Map<string, number>([
  ["C", 60],
  ["C♯", 61],
  ["D♭", 61],
  ["D", 62],
  ["E♭", 63],
  ["E", 64],
  ["F", 65],
  ["F♯", 66],
  ["G♭", 66],
  ["G", 67],
  ["A♭", 68],
  ["A", 69],
  ["B♭", 70],
  ["B", 71],
  ["C♭", 59],
]);

export function parse_musicxml_to_score_document(
  xml: string,
  metadata: calibration_work_metadata,
  options: {
    id?: string;
    source_file?: string;
  } = {},
): musicxml_import_result {
  const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as xml_node[];
  const root = parsed.find((node) => has_child(node, "score-partwise"));
  if (!root) {
    throw new Error("仅支持 score-partwise MusicXML。");
  }
  const score_nodes = children(root, "score-partwise");
  const title =
    nested_text(score_nodes, ["work", "work-title"]) ||
    nested_text(score_nodes, ["movement-title"]) ||
    options.source_file?.replace(/\.(?:musicxml|xml)$/iu, "") ||
    "未命名乐谱";
  const document_id = options.id ?? `calibration-${slugify(title)}`;
  const parts = score_nodes.filter((node) => has_child(node, "part"));
  if (parts.length === 0) {
    throw new Error("MusicXML 没有 part。");
  }

  const measure_map = new Map<number, score_document_measure>();
  const event_metadata: Record<string, calibration_event_metadata> = {};
  let first_key = "C major";
  let first_meter = { beats: 4, beat_unit: 4 };

  parts.forEach((part, part_index) => {
    let divisions = 1;
    let divisions_are_valid = true;
    let meter = first_meter;
    let page = 1;
    let system = 1;
    const clefs = new Map<number, calibration_event_metadata["clef"]>([
      [1, "treble"],
      [2, "bass"],
    ]);
    const measure_nodes = children(part, "part")
      .filter((node) => has_child(node, "measure"));

    measure_nodes.forEach((measure_node, measure_index) => {
      const measure_children = children(measure_node, "measure");
      const measure_number = attribute(measure_node, "number") ||
        String(measure_index + 1);
      const target = measure_map.get(measure_index) ?? {
        id: `${document_id}-measure-${measure_index + 1}`,
        number: measure_number,
        meter: { ...meter },
        events: [],
      };
      let cursor_quarters = 0;
      let previous_onset = 0;
      let pending_dynamics = "";
      let note_sequence = 0;

      for (const node of measure_children) {
        if (has_child(node, "print")) {
          if (attribute(node, "new-page") === "yes") {
            page += measure_index === 0 ? 0 : 1;
            system = 1;
          } else if (attribute(node, "new-system") === "yes") {
            system += measure_index === 0 ? 0 : 1;
          }
          continue;
        }
        if (has_child(node, "attributes")) {
          const attribute_nodes = children(node, "attributes");
          const divisions_text = text_value(attribute_nodes, "divisions")
            .trim();
          if (divisions_text) {
            const next_divisions = Number(divisions_text);
            divisions_are_valid =
              Number.isFinite(next_divisions) && next_divisions > 0;
            if (divisions_are_valid) {
              divisions = next_divisions;
            }
          }
          const time_nodes = first_children(attribute_nodes, "time");
          if (time_nodes.length > 0) {
            meter = {
              beats: numeric_text(time_nodes, "beats", meter.beats),
              beat_unit: numeric_text(
                time_nodes,
                "beat-type",
                meter.beat_unit,
              ),
            };
            target.meter = { ...meter };
            if (measure_index === 0 && part_index === 0) {
              first_meter = { ...meter };
            }
          }
          const key_nodes = first_children(attribute_nodes, "key");
          if (key_nodes.length > 0) {
            const fifths = numeric_text(key_nodes, "fifths", 0);
            const mode = text_value(key_nodes, "mode") || "major";
            const major_key = fifths_to_key.get(fifths) ?? "C major";
            const key = mode === "minor"
              ? `${relative_minor(major_key.split(" ")[0])} minor`
              : major_key;
            if (measure_index === 0 && part_index === 0) {
              first_key = key;
            }
          }
          for (const clef_node of attribute_nodes.filter((candidate) =>
            has_child(candidate, "clef"))) {
            const clef_children = children(clef_node, "clef");
            const staff_number = Number(attribute(clef_node, "number")) || 1;
            clefs.set(
              staff_number,
              parse_clef(
                text_value(clef_children, "sign"),
                numeric_text(clef_children, "line", 0),
              ),
            );
          }
          continue;
        }
        if (has_child(node, "direction")) {
          pending_dynamics =
            read_dynamic(children(node, "direction")) || pending_dynamics;
          continue;
        }
        if (has_child(node, "backup")) {
          cursor_quarters -= divisions_are_valid
            ? numeric_text(children(node, "backup"), "duration", 0) / divisions
            : 0;
          cursor_quarters = Math.max(0, cursor_quarters);
          continue;
        }
        if (has_child(node, "forward")) {
          cursor_quarters += divisions_are_valid
            ? numeric_text(children(node, "forward"), "duration", 0) / divisions
            : 0;
          continue;
        }
        if (!has_child(node, "note")) {
          continue;
        }

        note_sequence += 1;
        const note_nodes = children(node, "note");
        const is_chord = note_nodes.some((candidate) => has_child(candidate, "chord"));
        const duration_quarters =
          (divisions_are_valid
            ? numeric_text(note_nodes, "duration", 0) / divisions
            : 0) ||
          duration_from_type(text_value(note_nodes, "type"));
        const onset_quarters = is_chord ? previous_onset : cursor_quarters;
        const onset_beats = onset_quarters * meter.beat_unit / 4;
        const duration_beats = duration_quarters * meter.beat_unit / 4;
        const voice = numeric_text(note_nodes, "voice", 1);
        const staff = numeric_text(note_nodes, "staff", part_index + 1);
        const hand = infer_hand(staff, part_index);
        const event_id =
          `${document_id}-m${measure_index + 1}-p${part_index + 1}-e${target.events.length + 1}`;
        const note = read_note(
          note_nodes,
          `${document_id}-m${measure_index + 1}-p${part_index + 1}-n${note_sequence}`,
        );
        const tie = read_relation_type(note_nodes, "tie");
        const slur = read_nested_relation_type(note_nodes, "slur");
        const articulation = read_articulation(note_nodes);
        const fingering = read_fingering(note_nodes);
        if (note && fingering) {
          note.finger = fingering;
          note.fingering = create_imported_fingering_annotation(
            "从 MusicXML technical/fingering 导入。",
            note.source_refs,
          );
        }

        const chord_target = is_chord
          ? [...target.events].reverse().find((event) =>
              event.voice === voice &&
              event.hand === hand &&
              Math.abs(event.onset_beats - onset_beats) < 0.0001)
          : undefined;
        if (chord_target && note) {
          chord_target.notes.push(note);
          const current_metadata = event_metadata[chord_target.id];
          if (current_metadata) {
            current_metadata.articulation ||= articulation;
            current_metadata.dynamics ||= pending_dynamics;
            current_metadata.slur = merge_relation(
              current_metadata.slur,
              slur,
            );
          }
        } else {
          const event: score_document_event = {
            id: event_id,
            onset_beats,
            duration_beats: Math.max(duration_beats, 0.0625),
            hand,
            voice,
            notes: note ? [note] : [],
            tie,
            source_refs: [],
          };
          target.events.push(event);
          event_metadata[event.id] = {
            event_id: event.id,
            staff,
            hand,
            clef: clefs.get(staff) ?? "unknown",
            articulation,
            dynamics: pending_dynamics,
            slur,
            source_page: page,
            source_system: system,
          };
        }
        pending_dynamics = "";
        previous_onset = onset_quarters;
        if (!is_chord) {
          cursor_quarters += duration_quarters;
        }
      }
      measure_map.set(measure_index, target);
    });
  });

  const tonic_name = first_key.split(" ")[0];
  const document: score_document = {
    schema_version: 2,
    id: document_id,
    number: metadata.opus || null,
    title,
    key_signature: first_key,
    tonic_midi: key_to_tonic_midi.get(tonic_name) ?? 60,
    time_signature: `${first_meter.beats}/${first_meter.beat_unit}`,
    status: "needs_review",
    provenance: {
      kind: "manual",
      source_id: null,
      source_file: options.source_file ?? null,
      source_sha256: null,
      font_config_version: null,
      importer_version: "musicxml-calibration-import/v1",
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures: [...measure_map.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, measure]) => ({
        ...measure,
        events: [...measure.events].sort((left, right) =>
          left.onset_beats - right.onset_beats ||
          left.voice - right.voice ||
          left.id.localeCompare(right.id)),
      })),
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: null,
      published_at: null,
      note: `Imported for calibration${metadata.edition ? ` · ${metadata.edition}` : ""}`,
    },
  };

  return { document, event_metadata };
}

function read_note(
  nodes: xml_node[],
  id: string,
): score_document_note | undefined {
  const pitch_nodes = first_children(nodes, "pitch");
  if (pitch_nodes.length === 0) {
    return undefined;
  }
  const step = text_value(pitch_nodes, "step");
  const octave = numeric_text(pitch_nodes, "octave", 4);
  const alter = numeric_text(pitch_nodes, "alter", 0);
  if (!(step in step_offsets)) {
    return undefined;
  }
  return {
    id,
    midi: (octave + 1) * 12 + step_offsets[step] + alter,
    source_refs: [],
  };
}

function read_fingering(nodes: xml_node[]): 1 | 2 | 3 | 4 | 5 | undefined {
  const notations = first_children(nodes, "notations");
  const technical = first_children(notations, "technical");
  const finger = numeric_text(technical, "fingering", 0);
  return finger >= 1 && finger <= 5
    ? finger as 1 | 2 | 3 | 4 | 5
    : undefined;
}

function read_articulation(nodes: xml_node[]): string {
  const articulations = first_children(
    first_children(nodes, "notations"),
    "articulations",
  );
  return articulations
    .flatMap((node) => Object.keys(node).filter((key) => key !== ":@"))
    .join(",");
}

function read_dynamic(nodes: xml_node[]): string {
  const direction_types = first_children(nodes, "direction-type");
  const dynamics = first_children(direction_types, "dynamics");
  return dynamics
    .flatMap((node) => Object.keys(node).filter((key) => key !== ":@"))
    .join(",");
}

function read_relation_type(
  nodes: xml_node[],
  key: string,
): score_document_event["tie"] {
  const relation = nodes.find((node) => has_child(node, key));
  const type = relation ? attribute(relation, "type") : "";
  return type === "start" || type === "continue" || type === "stop"
    ? type
    : undefined;
}

function read_nested_relation_type(
  nodes: xml_node[],
  key: string,
): calibration_event_metadata["slur"] {
  const notations = first_children(nodes, "notations");
  const relation = notations.find((node) => has_child(node, key));
  const type = relation ? attribute(relation, "type") : "";
  return type === "start" || type === "continue" || type === "stop"
    ? type
    : "none";
}

function merge_relation(
  current: calibration_event_metadata["slur"],
  next: calibration_event_metadata["slur"],
): calibration_event_metadata["slur"] {
  return current === "none" ? next : current;
}

function infer_hand(staff: number, part_index: number): score_hand {
  if (staff >= 2 || part_index >= 1) {
    return "left";
  }
  return "right";
}

function parse_clef(
  sign: string,
  line: number,
): calibration_event_metadata["clef"] {
  if (sign === "G") return "treble";
  if (sign === "F") return "bass";
  if (sign === "C") return line === 4 ? "tenor" : "alto";
  if (sign === "percussion") return "percussion";
  return "unknown";
}

function duration_from_type(type: string): number {
  return {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    "16th": 0.25,
    "32nd": 0.125,
  }[type] ?? 0;
}

function relative_minor(major_tonic: string): string {
  return {
    "C♭": "A♭",
    "G♭": "E♭",
    "D♭": "B♭",
    "A♭": "F",
    "E♭": "C",
    "B♭": "G",
    F: "D",
    C: "A",
    G: "E",
    D: "B",
    A: "F♯",
    E: "C♯",
    B: "G♯",
    "F♯": "D♯",
    "C♯": "A♯",
  }[major_tonic] ?? "A";
}

function children(node: xml_node, key: string): xml_node[] {
  const value = node[key];
  return Array.isArray(value) ? value as xml_node[] : [];
}

function has_child(node: xml_node, key: string): boolean {
  return Array.isArray(node[key]);
}

function first_children(nodes: xml_node[], key: string): xml_node[] {
  const owner = nodes.find((node) => has_child(node, key));
  return owner ? children(owner, key) : [];
}

function text_value(nodes: xml_node[], key: string): string {
  const values = first_children(nodes, key);
  return values.length > 0 ? String(values[0]["#text"] ?? "") : "";
}

function numeric_text(
  nodes: xml_node[],
  key: string,
  fallback: number,
): number {
  const text = text_value(nodes, key).trim();
  if (!text) {
    return fallback;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}

function attribute(node: xml_node, name: string): string {
  const attributes = node[":@"] as xml_node | undefined;
  return String(attributes?.[`@_${name}`] ?? "");
}

function nested_text(nodes: xml_node[], path: string[]): string {
  let current = nodes;
  for (const key of path) {
    current = first_children(current, key);
    if (current.length === 0) {
      return "";
    }
  }
  return String(current[0]["#text"] ?? "");
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug || "untitled";
}
