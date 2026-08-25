import type { material_id } from "@/features/assets/types";
import type {
  jianpu_catalog,
  jianpu_chapter,
  jianpu_event,
  jianpu_material,
  jianpu_measure,
  jianpu_page,
  jianpu_page_slice,
  jianpu_score,
  jianpu_segment,
  jianpu_slice_mapping,
} from "./types";

let catalog_cache: Promise<jianpu_catalog> | undefined;
const score_cache = new Map<string, Promise<jianpu_score>>();

export async function load_jianpu_catalog(): Promise<jianpu_catalog> {
  catalog_cache ??= fetch_json("/api/v1/content/jianpu-materials", "简谱教材接口加载失败")
    .then(normalize_catalog)
    .catch(() =>
      fetch_json("/materials/jianpu-catalog.json", "简谱教材目录加载失败")
        .then(normalize_catalog))
    .catch((error: unknown) => {
      catalog_cache = undefined;
      throw error;
    });
  return catalog_cache;
}

export async function load_jianpu_score(url: string): Promise<jianpu_score> {
  const cached = score_cache.get(url);
  if (cached) {
    return cached;
  }

  const request = fetch_json(url, "简谱片段加载失败")
    .then(normalize_score)
    .catch((error: unknown) => {
      score_cache.delete(url);
      throw error;
    });
  score_cache.set(url, request);
  return request;
}

export function clear_jianpu_library_cache(): void {
  catalog_cache = undefined;
  score_cache.clear();
}

async function fetch_json(url: string, error_prefix: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`${error_prefix}：${response.status}`);
  }
  return response.json();
}

function normalize_catalog(value: unknown): jianpu_catalog {
  const record = as_record(value, "简谱教材目录格式无效");
  return {
    schema_version: as_schema_version(record.schema_version, "简谱教材目录版本无效"),
    generated_at: as_string(record.generated_at, "简谱教材目录缺少生成时间"),
    materials: as_array(record.materials, "简谱教材目录缺少教材").map(normalize_material),
  };
}

function normalize_material(value: unknown): jianpu_material {
  const record = as_record(value, "简谱教材格式无效");
  const page_count = as_positive_integer(record.page_count, "简谱教材页数无效");
  const pages = as_array(record.pages, "简谱教材缺少页码索引").map(normalize_page);
  const chapters = as_array(record.chapters, "简谱教材缺少章节目录").map(normalize_chapter);
  const segments = as_array(record.segments, "简谱教材缺少片段索引")
    .filter((segment) => !is_deleted_segment(segment))
    .map(normalize_segment);
  if (pages.length !== page_count) {
    throw new Error("简谱教材页码索引不完整");
  }
  validate_page_index(pages, page_count);
  const chapter_ids = new Set(chapters.map((chapter) => chapter.id));
  if (chapter_ids.size !== chapters.length) {
    throw new Error("简谱教材章节 ID 重复");
  }
  validate_chapter_coverage(chapters, page_count);
  for (const segment of segments) {
    if (segment.page_slices.some((slice) => !chapter_ids.has(slice.chapter_id))) {
      throw new Error("简谱教材页内章节归属无效");
    }
  }
  return {
    id: as_material_id(record.id),
    title: as_string(record.title, "简谱教材缺少标题"),
    description: as_string(record.description, "简谱教材缺少说明"),
    page_count,
    pages,
    chapters,
    segments,
  };
}

function validate_page_index(pages: jianpu_page[], page_count: number): void {
  if (pages.some((page, index) => page.page !== index + 1)) {
    throw new Error("简谱教材页码索引不连续");
  }
  if (pages.at(-1)?.page !== page_count) {
    throw new Error("简谱教材页码索引范围无效");
  }
}

function validate_chapter_coverage(
  chapters: jianpu_chapter[],
  page_count: number,
): void {
  let next_page = 1;
  for (const chapter of chapters) {
    if (chapter.page_start !== next_page || chapter.page_end > page_count) {
      throw new Error("简谱教材章节页码范围不连续");
    }
    next_page = chapter.page_end + 1;
  }
  if (next_page !== page_count + 1) {
    throw new Error("简谱教材章节未覆盖全部页码");
  }
}

function normalize_page(value: unknown): jianpu_page {
  const record = as_record(value, "简谱教材页码格式无效");
  return {
    page: as_positive_integer(record.page, "简谱教材页码无效"),
    title: as_string(record.title, "简谱教材页码缺少标题"),
    text: as_string(record.text, "简谱教材页码缺少文字"),
    exercise_labels: as_string_array(record.exercise_labels, "简谱教材练习标签无效"),
    section_title: as_optional_string(record.section_title, "简谱教材章节标题无效"),
  };
}

function is_deleted_segment(value: unknown): boolean {
  const record = as_record(value, "简谱教材片段格式无效");
  return record.deletion_status === "deleted";
}

function normalize_segment(value: unknown): jianpu_segment {
  const record = as_record(value, "简谱教材片段格式无效");
  const source_pages = as_array(record.source_pages, "简谱教材片段缺少来源页")
    .map((page) => as_positive_integer(page, "简谱教材来源页无效"));
  const page_slices = as_array(record.page_slices, "简谱教材片段缺少页内拆分")
    .map(normalize_page_slice);
  const measure_count = as_positive_integer(record.measure_count, "简谱教材小节数无效");
  validate_page_slices(source_pages, page_slices, measure_count);
  return {
    id: as_string(record.id, "简谱教材片段缺少 ID"),
    deletion_status: as_deletion_status(record.deletion_status),
    deleted_at: record.deleted_at === undefined
      ? undefined
      : as_string(record.deleted_at, "简谱教材删除时间无效"),
    sequence: as_positive_integer(record.sequence, "简谱教材片段序号无效"),
    title: as_string(record.title, "简谱教材片段缺少标题"),
    source_pages,
    source_page_label: as_string(record.source_page_label, "简谱教材片段缺少来源页说明"),
    page_slices,
    exercise_labels: as_string_array(record.exercise_labels, "简谱教材练习标签无效"),
    section_title: as_optional_string(record.section_title, "简谱教材章节标题无效"),
    jianpu_url: as_string(record.jianpu_url, "简谱教材片段缺少简谱地址"),
    musicxml_url: as_string(record.musicxml_url, "简谱教材片段缺少原谱地址"),
    measure_count,
    time_signature: as_string(record.time_signature, "简谱教材拍号无效"),
    key_signature: as_string(record.key_signature, "简谱教材调性无效"),
    tonic_midi: as_nonnegative_integer(record.tonic_midi, "简谱教材主音无效"),
    hand_mode: as_hand_mode(record.hand_mode),
    has_left_hand: as_boolean(record.has_left_hand, "简谱教材手别状态无效"),
    chord_count: as_nonnegative_integer(record.chord_count, "简谱教材和弦数无效"),
  };
}

function normalize_page_slice(value: unknown): jianpu_page_slice {
  const record = as_record(value, "简谱教材页内拆分格式无效");
  const measure_start = as_positive_integer(record.measure_start, "简谱教材页内起始小节无效");
  const measure_end = as_positive_integer(record.measure_end, "简谱教材页内结束小节无效");
  if (measure_end < measure_start) {
    throw new Error("简谱教材页内小节范围无效");
  }
  return {
    source_pages: as_array(record.source_pages, "简谱教材页内来源页无效")
      .map((page) => as_positive_integer(page, "简谱教材页内页码无效")),
    title: as_string(record.title, "简谱教材页内标题缺失"),
    text: as_string(record.text, "简谱教材页内文字缺失"),
    measure_start,
    measure_end,
    chapter_id: as_string(record.chapter_id, "简谱教材页内章节 ID 缺失"),
    chapter_title: as_string(record.chapter_title, "简谱教材页内章节标题缺失"),
    mapping: as_slice_mapping(record.mapping),
  };
}

function normalize_chapter(value: unknown): jianpu_chapter {
  const record = as_record(value, "简谱教材章节格式无效");
  const page_start = as_positive_integer(record.page_start, "简谱教材章节起始页无效");
  const page_end = as_positive_integer(record.page_end, "简谱教材章节结束页无效");
  if (page_end < page_start) {
    throw new Error("简谱教材章节页码范围无效");
  }
  return {
    id: as_string(record.id, "简谱教材章节 ID 缺失"),
    title: as_string(record.title, "简谱教材章节标题缺失"),
    description: as_string(record.description, "简谱教材章节说明缺失"),
    page_start,
    page_end,
  };
}

function validate_page_slices(
  source_pages: number[],
  page_slices: jianpu_page_slice[],
  measure_count: number,
): void {
  if (page_slices.length === 0) {
    throw new Error("简谱教材片段缺少页内拆分");
  }
  const sliced_pages = page_slices.flatMap((slice) => slice.source_pages);
  if (sliced_pages.length !== source_pages.length ||
    sliced_pages.some((page, index) => page !== source_pages[index])) {
    throw new Error("简谱教材页内来源页不一致");
  }
  let next_measure_start = 1;
  for (const slice of page_slices) {
    if (slice.source_pages.length === 0 || slice.measure_start !== next_measure_start) {
      throw new Error("简谱教材页内小节不连续");
    }
    next_measure_start = slice.measure_end + 1;
  }
  if (next_measure_start - 1 !== measure_count) {
    throw new Error("简谱教材页内小节未覆盖完整片段");
  }
}

function normalize_score(value: unknown): jianpu_score {
  const record = as_record(value, "简谱片段格式无效");
  return {
    schema_version: as_schema_version(record.schema_version, "简谱片段版本无效"),
    segment_id: as_string(record.segment_id, "简谱片段缺少 ID"),
    key_signature: as_string(record.key_signature, "简谱片段调性无效"),
    tonic_midi: as_nonnegative_integer(record.tonic_midi, "简谱片段主音无效"),
    time_signature: as_string(record.time_signature, "简谱片段拍号无效"),
    measures: as_array(record.measures, "简谱片段缺少小节").map(normalize_measure),
  };
}

function normalize_measure(value: unknown): jianpu_measure {
  const record = as_record(value, "简谱小节格式无效");
  return {
    index: as_positive_integer(record.index, "简谱小节序号无效"),
    number: as_string(record.number, "简谱小节编号无效"),
    directions: as_string_array(record.directions, "简谱小节提示无效"),
    events: as_array(record.events, "简谱小节缺少音符").map(normalize_event),
  };
}

function normalize_event(value: unknown): jianpu_event {
  const record = as_record(value, "简谱音符格式无效");
  return {
    onset_beats: as_nonnegative_number(record.onset_beats, "简谱起拍无效"),
    duration_beats: as_positive_number(record.duration_beats, "简谱时值无效"),
    right_notes: as_midi_notes(record.right_notes, "简谱右手音符无效"),
    left_notes: as_midi_notes(record.left_notes, "简谱左手音符无效"),
    right_fingerings: as_optional_jianpu_fingerings(record.right_fingerings, "简谱右手指法无效"),
    left_fingerings: as_optional_jianpu_fingerings(record.left_fingerings, "简谱左手指法无效"),
    chord: as_optional_string(record.chord, "简谱和弦标记无效"),
  };
}

function as_optional_jianpu_fingerings(
  value: unknown,
  message: string,
): jianpu_event["right_fingerings"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  return as_array(value, message).map((item) => {
    const record = as_record(item, message);
    const finger = as_positive_integer(record.finger, message);
    if (finger > 5) {
      throw new Error(message);
    }
    const source = record.source === "generated" || record.source === "manual"
      ? record.source
      : "score";
    return {
      note: as_nonnegative_integer(record.note, message),
      finger: finger as 1 | 2 | 3 | 4 | 5,
      source,
    };
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

function as_string(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

function as_optional_string(value: unknown, message: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return as_string(value, message);
}

function as_string_array(value: unknown, message: string): string[] {
  return as_array(value, message).map((item) => as_string(item, message));
}

function as_midi_notes(value: unknown, message: string): number[] {
  return as_array(value, message).map((item) => as_nonnegative_integer(item, message));
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

function as_boolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
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

function as_material_id(value: unknown): material_id {
  if (
    value === "beyer" ||
    value === "hanon" ||
    value === "john-thompson-easiest-1" ||
    value === "john-thompson-easiest-2"
  ) {
    return value;
  }
  throw new Error("简谱教材 ID 无效");
}

function as_deletion_status(value: unknown): "active" | "deleted" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "active" || value === "deleted") {
    return value;
  }
  throw new Error("简谱教材删除状态无效");
}

function as_hand_mode(value: unknown): "right" | "left" | "both" {
  if (value === "right" || value === "left" || value === "both") {
    return value;
  }
  throw new Error("简谱教材手别状态无效");
}

function as_slice_mapping(value: unknown): jianpu_slice_mapping {
  if (value === "verified" || value === "cross_page") {
    return value;
  }
  throw new Error("简谱教材页内映射状态无效");
}
