import type {
  score_document_event,
} from "@/features/score";

import type {
  calibration_event_metadata,
  calibration_project,
} from "./types";

export type notation_format = "jianpu" | "staff";

export interface notation_sync_note_mapping {
  note_id: string;
  midi: number;
  pitch_name: string;
}

export interface notation_sync_event_mapping {
  event_id: string;
  measure_id: string;
  measure_number: string;
  jianpu_element_id: string;
  staff_element_id: string;
  onset_beats: number;
  duration_beats: number;
  rest: boolean;
  hand: score_document_event["hand"];
  staff: number;
  clef: calibration_event_metadata["clef"];
  dynamics: string;
  notes: notation_sync_note_mapping[];
}

export interface notation_sync_discrepancy {
  code: string;
  message: string;
  measure_id?: string;
  event_id?: string;
  note_id?: string;
}

export type notation_change =
  | {
      origin: notation_format;
      kind: "pitch";
      event_id: string;
      note_id: string;
      midi: number;
    }
  | {
      origin: notation_format;
      kind: "pitch_names";
      event_id: string;
      pitch_names: string;
    }
  | {
      origin: notation_format;
      kind: "rhythm";
      event_id: string;
      onset_beats?: number;
      duration_beats?: number;
    }
  | {
      origin: notation_format;
      kind: "rest";
      event_id: string;
      rest: boolean;
    }
  | {
      origin: notation_format;
      kind: "event_metadata";
      event_id: string;
      dynamics?: string;
      articulation?: string;
      slur?: calibration_event_metadata["slur"];
      staff?: number;
      clef?: calibration_event_metadata["clef"];
    }
  | {
      origin: notation_format;
      kind: "signature";
      key_signature?: string;
      time_signature?: string;
    };

export function build_notation_sync_map(
  project: calibration_project,
): notation_sync_event_mapping[] {
  return project.document.measures.flatMap((measure) =>
    measure.events.map((event) => {
      const metadata = project.event_metadata[event.id] ??
        default_event_metadata(event);
      return {
        event_id: event.id,
        measure_id: measure.id,
        measure_number: measure.number,
        jianpu_element_id: `jianpu:${event.id}`,
        staff_element_id: `staff:${event.id}`,
        onset_beats: event.onset_beats,
        duration_beats: event.duration_beats,
        rest: event.notes.length === 0,
        hand: event.hand,
        staff: metadata.staff,
        clef: metadata.clef,
        dynamics: metadata.dynamics,
        notes: event.notes.map((note) => ({
          note_id: note.id,
          midi: note.midi,
          pitch_name: midi_to_pitch_name(note.midi),
        })),
      };
    }));
}

export function synchronize_notation_change(
  project: calibration_project,
  change: notation_change,
): calibration_project {
  const next = structuredClone(project);
  if (change.kind === "signature") {
    if (change.key_signature !== undefined) {
      next.document.key_signature = change.key_signature.trim();
    }
    if (change.time_signature !== undefined) {
      const meter = parse_time_signature(change.time_signature);
      next.document.time_signature = change.time_signature.trim();
      next.document.measures.forEach((measure) => {
        measure.meter = meter;
      });
    }
  } else {
    const event = find_event(next, change.event_id);
    if (!event) {
      throw new Error(`映射事件不存在：${change.event_id}`);
    }
    if (change.kind === "pitch") {
      const note = event.notes.find((candidate) => candidate.id === change.note_id);
      if (!note) {
        throw new Error(`映射音符不存在：${change.note_id}`);
      }
      assert_midi(change.midi);
      note.midi = change.midi;
    } else if (change.kind === "pitch_names") {
      apply_pitch_names(event, change.pitch_names);
    } else if (change.kind === "rhythm") {
      if (change.onset_beats !== undefined) {
        assert_nonnegative_number(change.onset_beats, "节拍位置");
        event.onset_beats = change.onset_beats;
      }
      if (change.duration_beats !== undefined) {
        if (!Number.isFinite(change.duration_beats) || change.duration_beats <= 0) {
          throw new Error("时值必须大于 0");
        }
        event.duration_beats = change.duration_beats;
      }
    } else if (change.kind === "rest") {
      if (change.rest) {
        event.notes = [];
      } else if (event.notes.length === 0) {
        event.notes = [{
          id: unique_note_id(next, `${event.id}-note`),
          midi: next.document.tonic_midi,
          source_refs: [],
        }];
      }
    } else {
      const metadata = next.event_metadata[event.id] ??
        default_event_metadata(event);
      if (change.dynamics !== undefined) metadata.dynamics = change.dynamics.trim();
      if (change.articulation !== undefined) {
        metadata.articulation = change.articulation.trim();
      }
      next.event_metadata[event.id] = metadata;
      if (change.slur !== undefined) {
        apply_slur_marking(next, event.id, change.slur);
      }
      if (change.staff !== undefined) metadata.staff = change.staff;
      if (change.clef !== undefined) metadata.clef = change.clef;
    }
  }
  synchronize_project_notation_metadata(next);
  next.updated_at = new Date().toISOString();
  return next;
}

export interface slur_pairing_result {
  paired_start_event_id?: string;
  continued_event_ids: string[];
}

export function apply_slur_marking(
  project: calibration_project,
  event_id: string,
  slur: calibration_event_metadata["slur"],
): slur_pairing_result {
  const ordered_events = ordered_project_events(project);
  const target_index = ordered_events.findIndex((entry) => entry.event.id === event_id);
  if (target_index < 0) {
    throw new Error(`映射事件不存在：${event_id}`);
  }
  const target = ordered_events[target_index];
  if (slur !== "none" && target.event.notes.length === 0) {
    throw new Error("Slur 只能标记在音符事件上，不能连接休止符。");
  }

  const target_metadata = project.event_metadata[target.event.id] ??
    default_event_metadata(target.event);
  target_metadata.slur = slur;
  project.event_metadata[target.event.id] = target_metadata;

  if (slur !== "stop") {
    return { continued_event_ids: [] };
  }

  const start_index = find_previous_slur_start_index(
    ordered_events,
    project.event_metadata,
    target_index,
  );
  if (start_index < 0) {
    return { continued_event_ids: [] };
  }

  const continued_event_ids: string[] = [];
  for (let index = start_index + 1; index < target_index; index += 1) {
    const candidate = ordered_events[index];
    if (!is_same_slur_lane(candidate.event, target.event) || candidate.event.notes.length === 0) {
      continue;
    }
    const metadata = project.event_metadata[candidate.event.id] ??
      default_event_metadata(candidate.event);
    if (metadata.slur === "start" || metadata.slur === "stop") {
      continue;
    }
    metadata.slur = "continue";
    project.event_metadata[candidate.event.id] = metadata;
    continued_event_ids.push(candidate.event.id);
  }

  return {
    paired_start_event_id: ordered_events[start_index].event.id,
    continued_event_ids,
  };
}

export function synchronize_project_notation_metadata(
  project: calibration_project,
): calibration_project {
  const live_event_ids = new Set<string>();
  for (const measure of project.document.measures) {
    for (const event of measure.events) {
      live_event_ids.add(event.id);
      const metadata = project.event_metadata[event.id] ??
        default_event_metadata(event);
      metadata.event_id = event.id;
      metadata.hand = event.hand;
      metadata.clef = hand_staff_clef();
      metadata.staff = staff_for_hand(event.hand);
      metadata.pitch_name = event.notes
        .map((note) => midi_to_pitch_name(note.midi))
        .join(" / ");
      metadata.duration_label = beats_to_duration_label(event.duration_beats);
      metadata.beat_position = format_number(event.onset_beats + 1);
      metadata.measure_label = measure.number;
      metadata.accidental = event.notes
        .map((note) => pitch_accidental(note.midi))
        .filter(Boolean)
        .join(" / ");
      metadata.rest = event.notes.length === 0
        ? `${beats_to_duration_label(event.duration_beats)} rest`
        : "";
      project.event_metadata[event.id] = metadata;
    }
  }
  for (const event_id of Object.keys(project.event_metadata)) {
    if (!live_event_ids.has(event_id)) {
      delete project.event_metadata[event_id];
    }
  }
  return project;
}

interface ordered_project_event {
  event: score_document_event;
  measure_index: number;
  onset_beats: number;
}

function ordered_project_events(project: calibration_project): ordered_project_event[] {
  return project.document.measures.flatMap((measure, measure_index) =>
    measure.events.map((event) => ({
      event,
      measure_index,
      onset_beats: event.onset_beats,
    })))
    .sort((a, b) =>
      a.measure_index - b.measure_index ||
      a.onset_beats - b.onset_beats ||
      event_voice(a.event) - event_voice(b.event));
}

function find_previous_slur_start_index(
  ordered_events: ordered_project_event[],
  event_metadata: Record<string, calibration_event_metadata>,
  target_index: number,
): number {
  const target = ordered_events[target_index];
  const open_start_indices: number[] = [];
  for (let index = 0; index < target_index; index += 1) {
    const candidate = ordered_events[index];
    if (!is_same_slur_lane(candidate.event, target.event)) {
      continue;
    }
    const slur = event_metadata[candidate.event.id]?.slur ?? "none";
    if (slur === "start") {
      open_start_indices.push(index);
    } else if (slur === "stop") {
      open_start_indices.pop();
    }
  }
  return open_start_indices.at(-1) ?? -1;
}

function is_same_slur_lane(
  first: score_document_event,
  second: score_document_event,
): boolean {
  return first.hand === second.hand;
}

function event_voice(event: score_document_event): number {
  return event.voice ?? (event.hand === "left" ? 2 : 1);
}

export function validate_notation_sync(
  project: calibration_project,
): notation_sync_discrepancy[] {
  const discrepancies: notation_sync_discrepancy[] = [];
  const mappings = build_notation_sync_map(project);
  const event_ids = new Set<string>();
  for (const mapping of mappings) {
    if (event_ids.has(mapping.event_id)) {
      discrepancies.push({
        code: "notation_mapping_duplicate",
        message: `事件 ${mapping.event_id} 无法建立唯一的简谱/五线谱映射。`,
        measure_id: mapping.measure_id,
        event_id: mapping.event_id,
      });
    }
    event_ids.add(mapping.event_id);
    const event = find_event(project, mapping.event_id);
    const metadata = project.event_metadata[mapping.event_id];
    if (!event || !metadata) {
      discrepancies.push({
        code: "notation_mapping_missing",
        message: `事件 ${mapping.event_id} 缺少双向映射信息。`,
        measure_id: mapping.measure_id,
        event_id: mapping.event_id,
      });
      continue;
    }
    const expected = derived_event_metadata(event, mapping.measure_number);
    for (const field of [
      "pitch_name",
      "duration_label",
      "beat_position",
      "measure_label",
      "accidental",
      "rest",
    ] as const) {
      if (
        metadata[field] !== undefined &&
        metadata[field] !== expected[field]
      ) {
        discrepancies.push({
          code: `notation_${field}_mismatch`,
          message: `事件 ${mapping.event_id} 的${metadata_field_label(field)}与乐谱事实不一致。`,
          measure_id: mapping.measure_id,
          event_id: mapping.event_id,
        });
      }
    }
    if (metadata.hand !== event.hand) {
      discrepancies.push({
        code: "notation_hand_mismatch",
        message: `事件 ${mapping.event_id} 的手别映射不一致。`,
        measure_id: mapping.measure_id,
        event_id: mapping.event_id,
      });
    }
  }

  const meter = parse_time_signature_optional(project.document.time_signature);
  if (!meter) {
    discrepancies.push({
      code: "notation_invalid_time_signature",
      message: `拍号 ${project.document.time_signature} 无法映射到简谱和五线谱。`,
    });
  }
  if (!project.document.key_signature.trim()) {
    discrepancies.push({
      code: "notation_key_signature_missing",
      message: "调号为空，无法同步生成简谱与五线谱。",
    });
  }
  return discrepancies;
}

export function parse_pitch_names(value: string): number[] {
  const tokens = value
    .trim()
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("音名不能为空");
  }
  return tokens.map(pitch_name_to_midi);
}

export function midi_to_pitch_name(midi: number): string {
  assert_midi(midi);
  const pitch_classes = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B",
  ];
  return `${pitch_classes[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function beats_to_duration_label(beats: number): string {
  if (beats === 4) return "whole";
  if (beats === 3) return "dotted-half";
  if (beats === 2) return "half";
  if (beats === 1.5) return "dotted-quarter";
  if (beats === 1) return "quarter";
  if (beats === 0.75) return "dotted-eighth";
  if (beats === 0.5) return "eighth";
  if (beats === 0.25) return "sixteenth";
  if (beats === 0.125) return "thirty-second";
  return `${format_number(beats)} beats`;
}

function apply_pitch_names(
  event: score_document_event,
  pitch_names: string,
): void {
  const midis = parse_pitch_names(pitch_names);
  event.notes = midis.map((midi, index) => {
    const current = event.notes[index];
    return current
      ? { ...current, midi }
      : {
          id: `${event.id}-note-${index + 1}`,
          midi,
          source_refs: [],
        };
  });
}

function pitch_name_to_midi(value: string): number {
  const match = value.match(/^([A-Ga-g])([#b♯♭]?)(-?\d+)$/);
  if (!match) {
    throw new Error(`音名格式无效：${value}`);
  }
  const semitones: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const accidental = match[2] === "#" || match[2] === "♯"
    ? 1
    : match[2] === "b" || match[2] === "♭"
      ? -1
      : 0;
  const midi = (Number(match[3]) + 1) * 12 + semitones[match[1].toUpperCase()] +
    accidental;
  assert_midi(midi);
  return midi;
}

function derived_event_metadata(
  event: score_document_event,
  measure_number: string,
) {
  return {
    pitch_name: event.notes.map((note) => midi_to_pitch_name(note.midi)).join(" / "),
    duration_label: beats_to_duration_label(event.duration_beats),
    beat_position: format_number(event.onset_beats + 1),
    measure_label: measure_number,
    accidental: event.notes
      .map((note) => pitch_accidental(note.midi))
      .filter(Boolean)
      .join(" / "),
    rest: event.notes.length === 0
      ? `${beats_to_duration_label(event.duration_beats)} rest`
      : "",
  };
}

function default_event_metadata(
  event: score_document_event,
): calibration_event_metadata {
  return {
    event_id: event.id,
    staff: staff_for_hand(event.hand),
    hand: event.hand,
    clef: hand_staff_clef(),
    articulation: "",
    dynamics: "",
    slur: "none",
    source_page: null,
    source_system: null,
  };
}

function staff_for_hand(hand: score_document_event["hand"]): number {
  return hand === "left" ? 2 : 1;
}

function hand_staff_clef(): "treble" {
  return "treble";
}

export function recommended_clef_for_event(
  event: score_document_event,
): "treble" | "bass" {
  if (event.notes.length === 0) {
    return hand_default_clef(event.hand);
  }
  const average_diatonic_index = event.notes.reduce(
    (sum, note) => sum + diatonic_index(note.midi),
    0,
  ) / event.notes.length;
  return average_diatonic_index >= diatonic_index(60) ? "treble" : "bass";
}

function hand_default_clef(hand: score_document_event["hand"]): "treble" | "bass" {
  return hand === "right" ? "treble" : "bass";
}

function diatonic_index(midi: number): number {
  const pitch_class_to_step = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return Math.floor(midi / 12) * 7 + pitch_class_to_step[midi % 12];
}

function find_event(
  project: calibration_project,
  event_id: string,
): score_document_event | undefined {
  return project.document.measures
    .flatMap((measure) => measure.events)
    .find((event) => event.id === event_id);
}

function pitch_accidental(midi: number): string {
  return [1, 3, 6, 8, 10].includes(midi % 12) ? "#" : "";
}

function parse_time_signature(value: string): { beats: number; beat_unit: number } {
  const meter = parse_time_signature_optional(value);
  if (!meter) {
    throw new Error(`拍号格式无效：${value}`);
  }
  return meter;
}

function parse_time_signature_optional(
  value: string,
): { beats: number; beat_unit: number } | undefined {
  const match = value.trim().match(/^(\d+)\/(\d+)$/);
  if (!match) return undefined;
  const beats = Number(match[1]);
  const beat_unit = Number(match[2]);
  return beats > 0 && beat_unit > 0 ? { beats, beat_unit } : undefined;
}

function unique_note_id(project: calibration_project, prefix: string): string {
  const ids = new Set(project.document.measures.flatMap((measure) =>
    measure.events.flatMap((event) => event.notes.map((note) => note.id))));
  let candidate = prefix;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${prefix}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function assert_midi(value: number): void {
  if (!Number.isInteger(value) || value < 21 || value > 108) {
    throw new Error(`MIDI 音高无效：${value}`);
  }
}

function assert_nonnegative_number(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}不能小于 0`);
  }
}

function format_number(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

function metadata_field_label(
  field: "pitch_name" | "duration_label" | "beat_position" |
    "measure_label" | "accidental" | "rest",
): string {
  return {
    pitch_name: "音高",
    duration_label: "时值",
    beat_position: "节拍位置",
    measure_label: "小节",
    accidental: "临时记号",
    rest: "休止符",
  }[field];
}
