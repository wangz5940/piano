import type {
  active_curriculum,
  curriculum_node_record,
  lesson_score_binding_record,
  published_curriculum_score_version,
} from "./types";

export const published_curriculum_snapshot_key =
  "lianqinbu.published-curriculum.v1";

export function save_published_curriculum_snapshot(
  curriculum: active_curriculum,
  storage = get_local_storage(),
): void {
  assert_published_curriculum(curriculum);
  storage?.setItem(
    published_curriculum_snapshot_key,
    JSON.stringify(curriculum),
  );
}

export function load_published_curriculum_snapshot(
  storage = get_local_storage(),
): active_curriculum | undefined {
  const serialized = storage?.getItem(published_curriculum_snapshot_key);
  if (!serialized) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(serialized);
    assert_published_curriculum(value);
    return value;
  } catch {
    storage?.removeItem(published_curriculum_snapshot_key);
    return undefined;
  }
}

export function assert_published_curriculum(
  value: unknown,
): asserts value is active_curriculum {
  if (!is_record(value) || value.status !== "published") {
    throw new Error("课程快照不是已发布课程。");
  }
  if (
    typeof value.active_revision_id !== "string" ||
    !is_record(value.revision) ||
    value.revision.id !== value.active_revision_id ||
    value.revision.status !== "published" ||
    !is_non_empty_string(value.revision.published_at)
  ) {
    throw new Error("课程快照缺少有效的已发布 revision。");
  }
  if (
    !Array.isArray(value.nodes) ||
    !value.nodes.every(is_curriculum_node) ||
    !Array.isArray(value.lesson_score_bindings) ||
    !value.lesson_score_bindings.every(is_lesson_score_binding) ||
    !Array.isArray(value.score_versions) ||
    !value.score_versions.every(is_published_score_version)
  ) {
    throw new Error("课程快照结构无效。");
  }

  const version_ids = new Set(
    value.score_versions.map((version) => version.id),
  );
  const lesson_ids = new Set(
    value.nodes
      .filter((node) => node.kind === "lesson")
      .map((node) => node.id),
  );
  if (value.lesson_score_bindings.some((binding) =>
    !version_ids.has(binding.score_version_id) ||
    !lesson_ids.has(binding.lesson_node_id))) {
    throw new Error("课程快照 binding 未指向有效的已发布乐谱或课程。");
  }
}

function is_curriculum_node(value: unknown): value is curriculum_node_record {
  return is_record(value) &&
    is_non_empty_string(value.id) &&
    is_non_empty_string(value.revision_id) &&
    ["stage", "week", "practice_day", "lesson"].includes(String(value.kind)) &&
    is_non_empty_string(value.title) &&
    typeof value.position === "number" &&
    is_record(value.payload) &&
    ["active", "archived"].includes(String(value.status)) &&
    is_non_empty_string(value.updated_at);
}

function is_lesson_score_binding(
  value: unknown,
): value is lesson_score_binding_record {
  return is_record(value) &&
    is_non_empty_string(value.id) &&
    is_non_empty_string(value.lesson_node_id) &&
    is_non_empty_string(value.score_version_id) &&
    ["primary", "reference", "practice_events"].includes(String(value.role)) &&
    typeof value.position === "number" &&
    is_record(value.settings);
}

function is_published_score_version(
  value: unknown,
): value is published_curriculum_score_version {
  return is_record(value) &&
    is_non_empty_string(value.id) &&
    is_non_empty_string(value.score_id) &&
    typeof value.version_number === "number" &&
    is_non_empty_string(value.source_sha256) &&
    is_non_empty_string(value.created_at) &&
    is_non_empty_string(value.published_at) &&
    is_record(value.document) &&
    value.document.schema_version === 2 &&
    value.document.status === "published";
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_non_empty_string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function get_local_storage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
