import type {
  material_catalog,
  material_collection,
  material_derived_assets,
  material_id,
  material_mapping_confidence,
  material_practice_event,
  material_practice_events,
  material_review_status,
  material_section,
  material_segment,
} from "./types";
import { apply_material_fingering_annotations } from "./fingeringAnnotations";
import { infer_note_fingerings } from "@/features/course/fingerings";

const material_ids = new Set<material_id>([
  "beyer",
  "hanon",
  "john-thompson-easiest-1",
  "john-thompson-easiest-2",
]);
const review_statuses = new Set<material_review_status>([
  "candidate",
  "validation_failed",
  "needs_review",
  "verified",
  "published",
  "rejected",
]);
const mapping_confidences = new Set<material_mapping_confidence>([
  "source_page",
  "exercise_number_verified",
]);

let material_catalog_cache: Promise<material_catalog> | undefined;
const musicxml_text_cache = new Map<string, Promise<string>>();
const practice_events_cache = new Map<string, Promise<material_practice_events>>();

export async function load_material_catalog(): Promise<material_catalog> {
  material_catalog_cache ??= fetch_json("/api/v1/content/materials", "教材接口加载失败")
    .then(normalize_material_catalog)
    .catch(() =>
      fetch_json("/materials/catalog.json", "教材目录加载失败")
        .then(normalize_material_catalog))
    .catch((error: unknown) => {
      material_catalog_cache = undefined;
      throw error;
    });

  return material_catalog_cache;
}

export async function load_musicxml_text(url: string): Promise<string> {
  const cached = musicxml_text_cache.get(url);
  if (cached) {
    return cached;
  }

  const request = fetch_text(url, "教材乐谱加载失败")
    .catch((error: unknown) => {
      musicxml_text_cache.delete(url);
      throw error;
    });
  musicxml_text_cache.set(url, request);
  return request;
}

export async function load_material_practice_events(url: string): Promise<material_practice_events> {
  const cached = practice_events_cache.get(url);
  if (cached) {
    return cached;
  }

  const request = fetch_json(url, "教材跟弹提示加载失败")
    .then(normalize_material_practice_events)
    .catch((error: unknown) => {
      practice_events_cache.delete(url);
      throw error;
    });
  practice_events_cache.set(url, request);
  return request;
}

export function clear_material_asset_cache(): void {
  material_catalog_cache = undefined;
  musicxml_text_cache.clear();
  practice_events_cache.clear();
}

async function fetch_json(url: string, error_prefix: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${error_prefix}：${response.status}`);
  }

  return response.json();
}

async function fetch_text(url: string, error_prefix: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${error_prefix}：${response.status}`);
  }

  return response.text();
}

export function normalize_material_catalog(value: unknown): material_catalog {
  const record = as_record(value, "教材目录格式无效");
  const materials = as_array(record.materials, "教材目录缺少 materials")
    .map(normalize_collection)
    .map((material) => ({
      ...material,
      segment_count: material.segments.length,
    }))
    .filter((material) => material.segments.length > 0);
  const segment_ids = new Set<string>();

  for (const material of materials) {
    if (material.segment_count !== material.segments.length) {
      throw new Error(`${material.title} 的片段数量与目录不一致`);
    }
    for (const segment of material.segments) {
      if (segment.material_id !== material.id) {
        throw new Error(`${segment.id} 的教材归属不一致`);
      }
      if (segment_ids.has(segment.id)) {
        throw new Error(`教材片段 ID 重复：${segment.id}`);
      }
      if (segment.status !== "published" && segment.realtime_judgement_allowed) {
        throw new Error("待核对谱例不能开启跟弹提示");
      }
      if (segment.status === "published" && !segment.realtime_judgement_allowed) {
        throw new Error("已发布谱例必须具备跟弹提示资格");
      }
      if (segment.status === "published" && !segment.derived_assets) {
        throw new Error("已发布谱例缺少同版本的派生产物");
      }
      if (segment.status === "published" && !segment.derived_assets?.practice_events_url) {
        throw new Error("已发布谱例缺少跟弹提示");
      }
      if (segment.derived_assets?.source_sha256 !== undefined &&
        segment.derived_assets.source_sha256 !== segment.sha256) {
        throw new Error("跟弹提示与当前原谱版本不一致");
      }
      segment_ids.add(segment.id);
    }
  }

  return apply_material_fingering_annotations({
    schema_version: as_string(record.schema_version, "教材目录缺少 schema_version"),
    generated_at: as_string(record.generated_at, "教材目录缺少 generated_at"),
    review_only: as_boolean(record.review_only, "教材目录缺少 review_only"),
    notice: as_string(record.notice, "教材目录缺少 notice"),
    materials,
  });
}

export function get_material_segment(
  catalog: material_catalog,
  material_id: material_id,
  segment_id: string,
): material_segment | undefined {
  return catalog.materials
    .find((material) => material.id === material_id)
    ?.segments.find((segment) => segment.id === segment_id);
}

function normalize_collection(value: unknown): material_collection {
  const record = as_record(value, "教材集合格式无效");
  const id = as_material_id(record.id);
  const segments = as_array(record.segments, `${id} 缺少片段列表`)
    .filter((segment) => !is_deleted_segment(segment))
    .map(normalize_segment);

  return {
    id,
    title: as_string(record.title, `${id} 缺少标题`),
    page_count: as_positive_integer(record.page_count, `${id} 页数无效`),
    segment_count: as_nonnegative_integer(record.segment_count, `${id} 片段数无效`),
    segments,
  };
}

function is_deleted_segment(value: unknown): boolean {
  const record = as_record(value, "教材片段格式无效");
  return record.deletion_status === "deleted";
}

function normalize_segment(value: unknown): material_segment {
  const record = as_record(value, "教材片段格式无效");
  const section = record.section === null || record.section === undefined
    ? undefined
    : normalize_section(record.section);
  const derived_assets = record.derived_assets === null || record.derived_assets === undefined
    ? undefined
    : normalize_derived_assets(record.derived_assets);

  return {
    id: as_string(record.id, "教材片段缺少 ID"),
    material_id: as_material_id(record.material_id),
    deletion_status: as_deletion_status(record.deletion_status),
    deleted_at: record.deleted_at === undefined
      ? undefined
      : as_string(record.deleted_at, "教材删除时间无效"),
    sequence: as_positive_integer(record.sequence, "教材片段序号无效"),
    title: as_string(record.title, "教材片段缺少标题"),
    source_pages: as_array(record.source_pages, "教材片段缺少源页")
      .map((page) => as_positive_integer(page, "教材源页无效")),
    source_page_label: as_string(record.source_page_label, "教材片段缺少源页说明"),
    ocr_labels: as_string_array(record.ocr_labels, "教材 OCR 标签无效"),
    ocr_exercise_numbers: as_array(record.ocr_exercise_numbers, "教材练习编号无效")
      .map((number) => as_positive_integer(number, "教材练习编号无效")),
    section,
    xml_version: as_string(record.xml_version, "教材片段缺少原谱版本"),
    part_count: as_nonnegative_integer(record.part_count, "教材声部数无效"),
    measure_count: as_nonnegative_integer(record.measure_count, "教材小节数无效"),
    time_signatures: as_string_array(record.time_signatures, "教材拍号无效"),
    musicxml_url: as_string(record.musicxml_url, "教材片段缺少原谱地址"),
    sha256: as_string(record.sha256, "教材片段缺少版本标识"),
    source_status: as_candidate_status(record.source_status),
    status: as_review_status(record.status),
    realtime_judgement_allowed: as_boolean(
      record.realtime_judgement_allowed,
      "教材跟弹提示状态无效",
    ),
    mapping_confidence: as_mapping_confidence(record.mapping_confidence),
    fingering_candidates_url: record.fingering_candidates_url === undefined
      ? undefined
      : as_string(record.fingering_candidates_url, "教材指法候选地址无效"),
    derived_assets,
  };
}

function normalize_section(value: unknown): material_section {
  const record = as_record(value, "教材章节格式无效");
  return {
    id: as_string(record.id, "教材章节缺少 ID"),
    title: as_string(record.title, "教材章节缺少标题"),
  };
}

function normalize_derived_assets(value: unknown): material_derived_assets {
  const record = as_record(value, "教材派生产物格式无效");
  return {
    source_sha256: as_string(record.source_sha256, "教材派生产物缺少源版本标识"),
    practice_events_url: as_string(record.practice_events_url, "教材派生产物缺少跟弹提示地址"),
    preview_url: record.preview_url === undefined ? undefined : as_string(record.preview_url, "教材 SVG 地址无效"),
    playback_url: record.playback_url === undefined ? undefined : as_string(record.playback_url, "教材 MIDI 地址无效"),
  };
}

function normalize_material_practice_events(value: unknown): material_practice_events {
  const record = as_record(value, "教材跟弹提示格式无效");
  const events = as_array(record.events, "教材跟弹提示缺少 events")
    .map(normalize_material_practice_event);

  if (events.length === 0) {
    throw new Error("教材跟弹提示为空");
  }

  return {
    schema_version: as_schema_version(record.schema_version, "教材跟弹提示版本无效"),
    asset_id: as_string(record.asset_id, "教材跟弹提示缺少 asset_id"),
    source_sha256: as_string(record.source_sha256, "教材跟弹提示缺少源版本标识"),
    events,
  };
}

function normalize_material_practice_event(value: unknown): material_practice_event {
  const record = as_record(value, "教材跟弹提示格式无效");
  const notes = as_array(record.notes, "教材跟弹提示音符无效")
    .map((note) => as_nonnegative_integer(note, "教材跟弹提示音符无效"));
  if (notes.length === 0) {
    throw new Error("教材跟弹提示必须包含至少一个音符");
  }

  return {
    id: as_string(record.id, "教材跟弹提示缺少 id"),
    measure_index: as_positive_integer(record.measure_index, "教材跟弹提示小节无效"),
    measure_number: as_string(record.measure_number, "教材跟弹提示小节编号无效"),
    onset_beats: as_nonnegative_number(record.onset_beats, "教材跟弹提示起拍无效"),
    duration_beats: as_positive_number(record.duration_beats, "教材跟弹提示时值无效"),
    notes,
    note_names: as_string_array(record.note_names, "教材跟弹提示音名无效"),
    fingerings: normalize_event_fingerings(record, notes, as_hand(record.hand)),
    notation: as_string(record.notation, "教材跟弹提示标记无效"),
    hand: as_hand(record.hand),
    match_mode: as_match_mode(record.match_mode),
  };
}

function normalize_event_fingerings(
  record: Record<string, unknown>,
  notes: number[],
  hand: material_practice_event["hand"],
): material_practice_event["fingerings"] {
  const inferred_fingerings = infer_note_fingerings(notes, hand);
  if (Array.isArray(record.fingerings)) {
    const fingerings = record.fingerings.map((value) => {
      const fingering = as_record(value, "教材指法格式无效");
      const note = as_nonnegative_integer(fingering.note, "教材指法音符无效");
      if (!notes.includes(note)) {
        throw new Error("教材指法音符不在当前事件中");
      }
      const finger = as_positive_integer(fingering.finger, "教材指号无效");
      if (finger > 5) {
        throw new Error("教材指号必须在 1—5 之间");
      }
      const fingering_hand = as_hand(fingering.hand);
      if (fingering_hand === "both") {
        throw new Error("单个指号必须明确属于左手或右手");
      }
      return {
        note,
        finger: finger as material_practice_event["fingerings"][number]["finger"],
        hand: fingering_hand,
        source: fingering.source === "score" ? "score" as const : "generated" as const,
      };
    });
    if (fingerings.length === notes.length) {
      return fingerings;
    }
    return merge_event_fingerings(notes, fingerings, inferred_fingerings);
  }

  return inferred_fingerings;
}

function merge_event_fingerings(
  notes: number[],
  fingerings: material_practice_event["fingerings"],
  inferred_fingerings: material_practice_event["fingerings"],
): material_practice_event["fingerings"] {
  const used = new Set<number>();
  return notes.map((note, index) => {
    const exact_index = fingerings.findIndex((fingering, fingering_index) =>
      !used.has(fingering_index) && fingering.note === note);
    if (exact_index >= 0) {
      used.add(exact_index);
      return fingerings[exact_index];
    }
    return inferred_fingerings[index] ?? inferred_fingerings.at(-1)!;
  });
}

function as_record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function as_array(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function as_string_array(value: unknown, message: string): string[] {
  return as_array(value, message).map((item) => as_string(item, message));
}

function as_string(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

function as_boolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
  return value;
}

function as_positive_integer(value: unknown, message: string): number {
  const result = as_nonnegative_integer(value, message);
  if (result === 0) {
    throw new Error(message);
  }
  return result;
}

function as_nonnegative_integer(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function as_nonnegative_number(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function as_positive_number(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
  return value;
}

function as_schema_version(value: unknown, message: string): "1.0" {
  if (value !== "1.0") {
    throw new Error(message);
  }
  return value;
}

function as_hand(value: unknown): material_practice_event["hand"] {
  if (value === "right" || value === "left" || value === "both") {
    return value;
  }
  throw new Error("教材跟弹提示手别无效");
}

function as_match_mode(value: unknown): material_practice_event["match_mode"] {
  if (value === "single_note" || value === "chord") {
    return value;
  }
  throw new Error("教材跟弹提示匹配方式无效");
}

function as_material_id(value: unknown): material_id {
  if (typeof value !== "string" || !material_ids.has(value as material_id)) {
    throw new Error("教材 ID 无效");
  }
  return value as material_id;
}

function as_review_status(value: unknown): material_review_status {
  if (typeof value !== "string" || !review_statuses.has(value as material_review_status)) {
    throw new Error("教材审核状态无效");
  }
  return value as material_review_status;
}

function as_deletion_status(value: unknown): "active" | "deleted" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "active" || value === "deleted") {
    return value;
  }
  throw new Error("教材删除状态无效");
}

function as_candidate_status(value: unknown): "candidate" {
  if (value !== "candidate") {
    throw new Error("教材来源状态无效");
  }
  return value;
}

function as_mapping_confidence(value: unknown): material_mapping_confidence {
  if (
    typeof value !== "string" ||
    !mapping_confidences.has(value as material_mapping_confidence)
  ) {
    throw new Error("教材映射置信度无效");
  }
  return value as material_mapping_confidence;
}
