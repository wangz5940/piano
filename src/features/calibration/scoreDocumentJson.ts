import { migrate_score_document } from "@/features/score/migration";
import type {
  score_annotation,
  score_document,
  score_document_event,
  score_document_input,
  score_document_measure,
  score_document_note,
} from "@/features/score";

const score_statuses = new Set([
  "candidate",
  "needs_review",
  "reviewed",
  "published",
]);
const annotation_sources = new Set(["pptx", "generated", "manual", "legacy"]);
const annotation_statuses = new Set([
  "candidate",
  "needs_review",
  "confirmed",
  "published",
  "rejected",
]);
const hands = new Set(["left", "right"]);
const ties = new Set(["start", "continue", "stop"]);

export function parse_score_document_json(value: string): score_document {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `JSON 格式无效：${error.message}`
        : "JSON 格式无效。",
    );
  }
  const document = migrate_score_document(
    parsed as score_document_input,
    { document_status: "needs_review" },
  );
  validate_score_document_shape(document);
  return document;
}

export function validate_score_document_shape(
  document: score_document,
): score_document {
  record(document, "ScoreDocument 必须是对象");
  if (document.schema_version !== 2) {
    throw new Error("ScoreDocument 版本必须为 v2。");
  }
  nonempty_string(document.id, "乐谱 ID");
  nonempty_string(document.title, "乐谱标题");
  nonempty_string(document.key_signature, "调号");
  integer_in_range(document.tonic_midi, "主音 MIDI", 0, 127);
  nonempty_string(document.time_signature, "拍号");
  if (!score_statuses.has(document.status)) {
    throw new Error("乐谱状态无效。");
  }
  record(document.provenance, "乐谱来源必须是对象。");
  if (!Array.isArray(document.lyrics)) {
    throw new Error("歌词必须是数组。");
  }
  if (!Array.isArray(document.hand_positions)) {
    throw new Error("手位必须是数组。");
  }
  record(document.review, "审核信息必须是对象。");
  if (!Array.isArray(document.measures) || document.measures.length === 0) {
    throw new Error("乐谱至少需要一个小节。");
  }
  if (document.measures.length > 20_000) {
    throw new Error("乐谱小节数量过多。");
  }

  const measure_ids = new Set<string>();
  const event_ids = new Set<string>();
  const note_ids = new Set<string>();
  for (const measure of document.measures) {
    validate_measure(measure, measure_ids, event_ids, note_ids);
  }
  return document;
}

function validate_measure(
  measure: score_document_measure,
  measure_ids: Set<string>,
  event_ids: Set<string>,
  note_ids: Set<string>,
): void {
  record(measure, "小节必须是对象。");
  nonempty_string(measure.id, "小节 ID");
  if (measure_ids.has(measure.id)) {
    throw new Error(`小节 ID 重复：${measure.id}`);
  }
  measure_ids.add(measure.id);
  nonempty_string(measure.number, "小节号");
  record(measure.meter, `${measure.number} 小节拍号必须是对象。`);
  positive_number(measure.meter.beats, `${measure.number} 小节拍数`);
  positive_number(measure.meter.beat_unit, `${measure.number} 小节拍号分母`);
  if (!Array.isArray(measure.events)) {
    throw new Error(`${measure.number} 小节事件必须是数组。`);
  }
  for (const event of measure.events) {
    validate_event(event, measure, event_ids, note_ids);
  }
}

function validate_event(
  event: score_document_event,
  measure: score_document_measure,
  event_ids: Set<string>,
  note_ids: Set<string>,
): void {
  record(event, "乐谱事件必须是对象。");
  nonempty_string(event.id, "事件 ID");
  if (event_ids.has(event.id)) {
    throw new Error(`事件 ID 重复：${event.id}`);
  }
  event_ids.add(event.id);
  nonnegative_number(event.onset_beats, `${event.id} 起拍`);
  positive_number(event.duration_beats, `${event.id} 时值`);
  if (event.onset_beats + event.duration_beats > measure.meter.beats + 0.0001) {
    throw new Error(`${event.id} 时值超出 ${measure.number} 小节。`);
  }
  if (!hands.has(event.hand)) {
    throw new Error(`${event.id} 手别必须是 left 或 right。`);
  }
  integer_in_range(event.voice, `${event.id} 声部`, 1, 128);
  if (event.tie !== undefined && !ties.has(event.tie)) {
    throw new Error(`${event.id} 延音线状态无效。`);
  }
  if (!Array.isArray(event.notes)) {
    throw new Error(`${event.id} 音符列表必须是数组。`);
  }
  for (const note of event.notes) {
    validate_note(note, event.id, note_ids);
  }
}

function validate_note(
  note: score_document_note,
  event_id: string,
  note_ids: Set<string>,
): void {
  record(note, "音符必须是对象。");
  nonempty_string(note.id, "音符 ID");
  if (note_ids.has(note.id)) {
    throw new Error(`音符 ID 重复：${note.id}`);
  }
  note_ids.add(note.id);
  integer_in_range(note.midi, `${event_id} 音高`, 21, 108);
  if (note.finger !== undefined) {
    integer_in_range(note.finger, `${event_id} 指法`, 1, 5);
    if (note.fingering === undefined) {
      throw new Error("v2 指法必须包含来源、状态和依据。");
    }
  }
  if (note.fingering !== undefined) {
    if (note.finger === undefined) {
      throw new Error("指法说明缺少指法值。");
    }
    validate_annotation(note.fingering, `${event_id} 指法说明`);
  }
}

function validate_annotation(annotation: score_annotation, label: string): void {
  record(annotation, `${label}必须是对象。`);
  if (!annotation_sources.has(annotation.source)) {
    throw new Error(`${label}来源无效。`);
  }
  if (!annotation_statuses.has(annotation.status)) {
    throw new Error(`${label}状态无效。`);
  }
  nonempty_string(annotation.reason, `${label}依据`);
  if (!Array.isArray(annotation.source_refs)) {
    throw new Error(`${label}来源引用必须是数组。`);
  }
  if (
    annotation.confirmed_by !== null &&
    typeof annotation.confirmed_by !== "string"
  ) {
    throw new Error(`${label}确认人无效。`);
  }
  if (
    annotation.confirmed_at !== null &&
    typeof annotation.confirmed_at !== "string"
  ) {
    throw new Error(`${label}确认时间无效。`);
  }
}

function record(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function nonempty_string(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}不能为空。`);
  }
}

function nonnegative_number(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}不能小于 0。`);
  }
}

function positive_number(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}必须大于 0。`);
  }
}

function integer_in_range(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(`${label}必须是 ${minimum}-${maximum} 的整数。`);
  }
}
