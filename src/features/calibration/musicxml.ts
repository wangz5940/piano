import { XMLBuilder, XMLParser } from "fast-xml-parser";

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
  const part_names = new Map(first_children(score_nodes, "part-list")
    .filter((node) => has_child(node, "score-part"))
    .map((node) => [attribute(node, "id"), text_value(children(node, "score-part"), "part-name")]));
  if (parts.length === 0) {
    throw new Error("MusicXML 没有 part。");
  }

  const structure = index_measures(parts);
  const measure_map = new Map<number, score_document_measure>();
  const event_metadata: Record<string, calibration_event_metadata> = {};
  let first_key = "C major";
  let first_meter = { beats: 4, beat_unit: 4 };
  for (const [index, entry] of structure.entries.entries()) {
    first_key = entry.key ?? first_key;
    first_meter = entry.meter ?? first_meter;
    measure_map.set(index, {
      id: `${document_id}-measure-${index + 1}`,
      number: entry.number,
      meter: { ...first_meter },
      key_signature: first_key,
      tonic_midi: key_to_tonic_midi.get(first_key.split(" ")[0]) ?? 60,
      events: [],
    });
  }
  first_key = measure_map.get(0)?.key_signature ?? "C major";
  first_meter = measure_map.get(0)?.meter ?? { beats: 4, beat_unit: 4 };
  const voice_stride = Math.max(1, ...parts.flatMap((part) =>
    children(part, "part").flatMap((measure) =>
      children(measure, "measure").filter((node) => has_child(node, "note"))
        .map((node) => numeric_text(children(node, "note"), "voice", 1)))));

  parts.forEach((part, part_index) => {
    const part_name = part_names.get(attribute(part, "id")) ?? "";
    const explicit_hand = /left hand|左手/iu.test(part_name)
      ? "left" : /right hand|右手/iu.test(part_name) ? "right" : undefined;
    let divisions = 1;
    let divisions_are_valid = true;
    let staves = 1;
    const hidden_staffs = new Map<number, boolean>();
    const clefs = new Map<number, calibration_event_metadata["clef"]>([
      [1, "treble"],
      [2, "bass"],
    ]);
    const measure_nodes = children(part, "part")
      .filter((node) => has_child(node, "measure"));

    measure_nodes.forEach((measure_node, local_index) => {
      const measure_index = structure.indices[part_index][local_index];
      const measure_children = children(measure_node, "measure");
      const target = measure_map.get(measure_index)!;
      const meter = target.meter;
      const location = structure.entries[measure_index];
      const attributes = measure_children.flatMap((node) => children(node, "attributes"));
      const declared_divisions = text_value(attributes, "divisions");
      if (declared_divisions) {
        divisions = Number(declared_divisions);
        divisions_are_valid = Number.isFinite(divisions) && divisions > 0;
      }
      // Some OMR files round divisions below one to zero but retain proportional
      // durations. Recover that scale before interpreting backup/forward/rests.
      const effective_divisions = divisions_are_valid
        ? divisions
        : infer_divisions(measure_children, meter);
      let cursor_quarters = 0;
      let previous_onset = 0;
      let pending_dynamics = "";
      let pending_wedge: calibration_event_metadata["wedge"];
      let pending_pedal: calibration_event_metadata["pedal"];
      let pending_words = "";
      let note_sequence = 0;

      for (const node of measure_children) {
        if (has_child(node, "print")) {
          continue;
        }
        if (has_child(node, "attributes")) {
          const attribute_nodes = children(node, "attributes");
          staves = numeric_text(attribute_nodes, "staves", staves);
          for (const details of attribute_nodes.filter((candidate) =>
            has_child(candidate, "staff-details"))) {
            hidden_staffs.set(
              Number(attribute(details, "number")) || 0,
              attribute(details, "print-object") === "no",
            );
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
          const direction_nodes = children(node, "direction");
          pending_dynamics = read_dynamic(direction_nodes) || pending_dynamics;
          pending_wedge = read_direction_relation(
            direction_nodes,
            "wedge",
            ["crescendo", "diminuendo", "stop"],
          ) ?? pending_wedge;
          pending_pedal = read_direction_relation(
            direction_nodes,
            "pedal",
            ["start", "stop", "change", "continue"],
          ) ?? pending_pedal;
          pending_words = read_direction_words(direction_nodes) || pending_words;
          continue;
        }
        if (has_child(node, "backup")) {
          cursor_quarters -= effective_divisions
            ? numeric_text(children(node, "backup"), "duration", 0) / effective_divisions
            : 0;
          cursor_quarters = Math.max(0, cursor_quarters);
          continue;
        }
        if (has_child(node, "forward")) {
          cursor_quarters += effective_divisions
            ? numeric_text(children(node, "forward"), "duration", 0) / effective_divisions
            : 0;
          continue;
        }
        if (!has_child(node, "note")) {
          continue;
        }

        note_sequence += 1;
        const note_nodes = children(node, "note");
        const staff = numeric_text(note_nodes, "staff", 1);
        if (
          (hidden_staffs.get(staff) ?? hidden_staffs.get(0)) &&
          note_nodes.some((candidate) => has_child(candidate, "rest"))
        ) {
          // Audiveris pads absent parts with hidden whole-measure rests,
          // including nonzero ones. They are not printed musical events.
          continue;
        }
        const is_chord = note_nodes.some((candidate) => has_child(candidate, "chord"));
        const duration_quarters =
          (effective_divisions
            ? numeric_text(note_nodes, "duration", 0) / effective_divisions
            : 0) ||
          notated_duration(note_nodes);
        const onset_quarters = is_chord ? previous_onset : cursor_quarters;
        const onset_beats = onset_quarters * meter.beat_unit / 4;
        const duration_beats = duration_quarters * meter.beat_unit / 4;
        const voice = numeric_text(note_nodes, "voice", 1) + part_index * voice_stride;
        const hand = explicit_hand ?? infer_hand(staff, staves, clefs.get(staff));
        const event_id =
          `${document_id}-m${measure_index + 1}-p${part_index + 1}-e${target.events.length + 1}`;
        const note = read_note(
          note_nodes,
          `${document_id}-m${measure_index + 1}-p${part_index + 1}-n${note_sequence}`,
        );
        const tie = read_relation_type(note_nodes, "tie");
        const slur = read_nested_relation_type(note_nodes, "slur");
        const articulation = read_articulation(note_nodes);
        const fermata = read_fermata(note_nodes);
        const ornament = read_ornament(note_nodes);
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
            current_metadata.fermata ||= fermata;
            current_metadata.ornament ||= ornament;
            current_metadata.wedge ||= pending_wedge;
            current_metadata.pedal ||= pending_pedal;
            current_metadata.words ||= pending_words;
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
            fermata,
            ornament,
            wedge: pending_wedge,
            pedal: pending_pedal,
            words: pending_words,
            source_page: location.page,
            source_system: location.system,
          };
        }
        pending_dynamics = "";
        pending_wedge = undefined;
        pending_pedal = undefined;
        pending_words = "";
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

function read_direction_relation<T extends string>(
  nodes: xml_node[],
  key: string,
  valid_types: readonly T[],
): T | undefined {
  const direction_types = first_children(nodes, "direction-type");
  const relation = direction_types.find((node) => has_child(node, key));
  const type = relation ? attribute(relation, "type") : "";
  return valid_types.includes(type as T) ? type as T : undefined;
}

function read_direction_words(nodes: xml_node[]): string {
  return text_value(first_children(nodes, "direction-type"), "words").trim();
}

function read_fermata(
  nodes: xml_node[],
): calibration_event_metadata["fermata"] {
  const fermata = first_children(nodes, "notations")
    .find((node) => has_child(node, "fermata"));
  const type = fermata ? attribute(fermata, "type") : "";
  return type === "inverted" ? "inverted" : fermata ? "upright" : undefined;
}

function read_ornament(nodes: xml_node[]): string | undefined {
  const ornaments = first_children(
    first_children(nodes, "notations"),
    "ornaments",
  );
  return ornaments
    .flatMap((node) => Object.keys(node).filter((key) => key !== ":@"))
    .find(Boolean);
}

function read_relation_type(
  nodes: xml_node[],
  key: string,
): score_document_event["tie"] {
  const types = nodes.filter((node) => has_child(node, key))
    .map((node) => attribute(node, "type"));
  if (types.includes("start") && types.includes("stop")) return "continue";
  const type = types[0];
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

function infer_hand(
  staff: number,
  staves: number,
  clef: calibration_event_metadata["clef"] | undefined,
): score_hand {
  // Staff numbers are local to their part. A later piano part still has a
  // right-hand upper staff; a single bass-clef exercise is left-handed.
  return staves >= 2 || staff >= 2
    ? staff >= 2 ? "left" : "right"
    : clef === "bass" ? "left" : "right";
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

function notated_duration(nodes: xml_node[]): number {
  const dots = nodes.filter((node) => has_child(node, "dot")).length;
  const modification = first_children(nodes, "time-modification");
  return duration_from_type(text_value(nodes, "type")) *
    (2 - 2 ** -dots) *
    numeric_text(modification, "normal-notes", 1) /
    numeric_text(modification, "actual-notes", 1);
}

function infer_divisions(
  nodes: xml_node[],
  meter: score_document_measure["meter"],
): number | undefined {
  const notes = nodes.filter((node) => has_child(node, "note"));
  const typed = notes.filter((node) => notated_duration(children(node, "note")) > 0);
  const candidates = (typed.length ? typed : notes)
    .map((node) => {
      const note = children(node, "note");
      const notated = notated_duration(note);
      const rest = note.find((candidate) => has_child(candidate, "rest"));
      const quarters = notated || (rest && attribute(rest, "measure") === "yes"
        ? meter.beats * 4 / meter.beat_unit
        : 0);
      return quarters ? numeric_text(note, "duration", 0) / quarters : 0;
    }).filter((value) => Number.isFinite(value) && value > 0);
  // Accept only a consistent ratio. Conflicting notation stays visible to the
  // rhythm validator instead of forcing an arbitrary timing repair.
  return candidates.length > 0 &&
    candidates.every((value) => Math.abs(value - candidates[0]) < 0.0001)
    ? candidates[0]
    : undefined;
}

function index_measures(parts: xml_node[]) {
  const keys: string[] = [];
  const by_key = new Map<string, {
    number: string;
    nodes: xml_node[];
    meter?: score_document_measure["meter"];
    key?: string;
    page: number;
    system: number;
  }>();
  const part_keys = parts.map((part) => {
    const occurrences = new Map<string, number>();
    return children(part, "part").filter((node) => has_child(node, "measure"))
      .map((node, index) => {
        const number = attribute(node, "number") || String(index + 1);
        const occurrence = occurrences.get(number) ?? 0;
        occurrences.set(number, occurrence + 1);
        const key = `${number}|${occurrence}`;
        if (!by_key.has(key)) {
          keys.push(key);
          by_key.set(key, { number, nodes: [], page: 1, system: 1 });
        }
        by_key.get(key)!.nodes.push(node);
        return key;
      });
  });
  // Audiveris can omit leading measures in a part. Number + occurrence aligns
  // these parts while keeping repeated numbers (e.g. instructional examples).
  if (keys.every((key) => /^\d+\|\d+$/u.test(key))) {
    keys.sort((a, b) => Number(a.split("|")[0]) - Number(b.split("|")[0]) ||
      Number(a.split("|")[1]) - Number(b.split("|")[1]));
  }
  let page = 1;
  let system = 1;
  const entries = keys.map((key, index) => {
    const entry = by_key.get(key)!;
    const nodes = entry.nodes.flatMap((node) => children(node, "measure"));
    const prints = nodes.filter((node) => has_child(node, "print"));
    if (index > 0 && prints.some((node) => attribute(node, "new-page") === "yes")) {
      page += 1;
      system = 1;
    } else if (index > 0 && prints.some((node) => attribute(node, "new-system") === "yes")) {
      system += 1;
    }
    entry.page = page;
    entry.system = system;
    for (const measure of entry.nodes) {
      const attrs = children(measure, "measure").flatMap((node) => children(node, "attributes"));
      if (attrs.some((node) => has_child(node, "staff-details") &&
        attribute(node, "print-object") === "no")) continue;
      const time = first_children(attrs, "time");
      if (time.length && !entry.meter) {
        entry.meter = {
          beats: numeric_text(time, "beats", 4),
          beat_unit: numeric_text(time, "beat-type", 4),
        };
      }
      const key_nodes = first_children(attrs, "key");
      if (key_nodes.length && !entry.key) {
        const major = fifths_to_key.get(numeric_text(key_nodes, "fifths", 0)) ?? "C major";
        entry.key = text_value(key_nodes, "mode") === "minor"
          ? `${relative_minor(major.split(" ")[0])} minor`
          : major;
      }
    }
    return entry;
  });
  const indices = part_keys.map((part) => part.map((key) => keys.indexOf(key)));
  return { entries, indices };
}

/** Repair only mathematically recoverable divisions=0 OMR output, retaining
 * source layout, beams, lyrics, repeats and pitch spelling in the XML. */
export function normalize_musicxml_divisions(xml: string): {
  xml: string;
  repaired_measures: number;
} {
  const options = { ignoreAttributes: false, preserveOrder: true, trimValues: true };
  const parsed = new XMLParser(options).parse(xml) as xml_node[];
  const root = parsed.find((node) => has_child(node, "score-partwise"));
  if (!root) throw new Error("仅支持 score-partwise MusicXML。");
  const parts = children(root, "score-partwise").filter((node) => has_child(node, "part"));
  const structure = index_measures(parts);
  let repaired_measures = 0;
  for (const [part_index, part] of parts.entries()) {
    let source_divisions = 1;
    let output_divisions = 1;
    let meter = { beats: 4, beat_unit: 4 };
    const measures = children(part, "part").filter((node) => has_child(node, "measure"));
    for (const [local_index, measure] of measures.entries()) {
      const nodes = children(measure, "measure");
      const first_timed = nodes.findIndex((node) =>
        ["note", "backup", "forward"].some((name) => has_child(node, name)));
      let attrs = nodes.slice(0, first_timed < 0 ? nodes.length : first_timed)
        .find((node) => has_child(node, "attributes"));
      const attr_nodes = attrs ? children(attrs, "attributes") : [];
      const division_node = attr_nodes.find((node) => has_child(node, "divisions"));
      const declared = text_value(attr_nodes, "divisions");
      if (declared) {
        source_divisions = Number(declared);
        output_divisions = source_divisions;
      }
      meter = structure.entries[structure.indices[part_index][local_index]].meter ?? meter;
      if (source_divisions > 0) continue;
      const inferred = infer_divisions(nodes, meter);
      if (!inferred) {
        // Do not accidentally inherit the preceding repaired scale.
        if (output_divisions > 0 && !declared) {
          if (!attrs) {
            attrs = { attributes: [] };
            nodes.unshift(attrs);
          }
          children(attrs, "attributes").unshift({ divisions: [{ "#text": 0 }] });
          output_divisions = 0;
        }
        continue;
      }
      const durations = nodes.flatMap((node) =>
        ["note", "backup", "forward"].flatMap((key) =>
          children(node, key).filter((child) => has_child(child, "duration"))));
      const values = durations.map((duration) =>
        Number(children(duration, "duration")[0]?.["#text"] ?? 0) / inferred * 960);
      if (!values.every((value) => Math.abs(value - Math.round(value)) < 0.001)) continue;
      durations.forEach((duration, index) => {
        duration.duration = [{ "#text": Math.round(values[index]) }];
      });
      if (division_node) division_node.divisions = [{ "#text": 960 }];
      else {
        if (!attrs) {
          attrs = { attributes: [] };
          nodes.unshift(attrs);
        }
        children(attrs, "attributes").unshift({ divisions: [{ "#text": 960 }] });
      }
      output_divisions = 960;
      repaired_measures += 1;
    }
  }
  return {
    xml: repaired_measures ? new XMLBuilder({ ...options, format: true }).build(parsed) : xml,
    repaired_measures,
  };
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
