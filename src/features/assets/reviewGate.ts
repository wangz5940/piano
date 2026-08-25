import {
  can_transition_material_status,
  can_use_for_realtime_judgement,
  get_publish_block_reason,
  is_review_checklist_complete,
} from "./policy";
import type {
  material_catalog,
  material_collection,
  material_review_checklist,
  material_review_record,
  material_review_records,
  material_review_status,
  material_segment,
} from "./types";

export const material_review_storage_key = "lianqinbu.material-review-gates.v1";
export const material_review_change_event = "lianqinbu:material-review-gate-change";

const history_limit = 12;
const review_statuses = new Set<material_review_status>([
  "candidate",
  "validation_failed",
  "needs_review",
  "verified",
  "published",
  "rejected",
]);

export function create_initial_material_review_records(): material_review_records {
  return {
    schema_version: 1,
    records: {},
  };
}

export function load_material_review_records(): material_review_records {
  if (typeof window === "undefined") {
    return create_initial_material_review_records();
  }

  try {
    const serialized = window.localStorage.getItem(material_review_storage_key);
    if (!serialized) {
      return create_initial_material_review_records();
    }
    return parse_material_review_records(JSON.parse(serialized)) ?? create_initial_material_review_records();
  } catch {
    return create_initial_material_review_records();
  }
}

export function save_material_review_records(records: material_review_records): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(material_review_storage_key, JSON.stringify(records));
  window.dispatchEvent(new Event(material_review_change_event));
}

export function persist_material_review_record(
  records: material_review_records,
  record: material_review_record,
): material_review_records {
  const next_records: material_review_records = {
    schema_version: 1,
    records: {
      ...records.records,
      [record.segment_id]: record,
    },
  };

  save_material_review_records(next_records);
  return next_records;
}

export function clear_material_review_record(
  records: material_review_records,
  segment_id: string,
): material_review_records {
  const remaining_records = Object.fromEntries(
    Object.entries(records.records).filter(([record_segment_id]) => record_segment_id !== segment_id),
  ) as Record<string, material_review_record>;
  const next_records: material_review_records = {
    schema_version: 1,
    records: remaining_records,
  };

  save_material_review_records(next_records);
  return next_records;
}

export function get_material_review_record(
  records: material_review_records,
  segment: material_segment,
): material_review_record | undefined {
  const record = records.records[segment.id];
  return record?.content_sha256 === segment.sha256 ? record : undefined;
}

export function transition_material_review(
  segment: material_segment,
  existing_record: material_review_record | undefined,
  next_status: material_review_status,
  checks: material_review_checklist,
  raw_note: string,
  changed_at = new Date().toISOString(),
): material_review_record {
  const current_record = existing_record?.content_sha256 === segment.sha256
    ? existing_record
    : undefined;
  const from_status = current_record?.status ?? segment.status;
  const note = raw_note.trim();

  if (!can_transition_material_status(from_status, next_status)) {
    throw new Error(`不能从 ${from_status} 变更为 ${next_status}`);
  }
  if (next_status === "verified" && !is_review_checklist_complete(checks)) {
    throw new Error("标记为已验证前必须完成四项审核证据");
  }
  if (next_status === "published") {
    const publish_block_reason = get_publish_block_reason(segment, checks);
    if (publish_block_reason) {
      throw new Error(publish_block_reason);
    }
  }
  if (requires_audit_note(next_status) && !note) {
    throw new Error("请填写本次审核结论");
  }

  const history = [
    ...(current_record?.history ?? []),
    {
      from_status,
      to_status: next_status,
      changed_at,
      note,
    },
  ].slice(-history_limit);

  return {
    segment_id: segment.id,
    content_sha256: segment.sha256,
    status: next_status,
    checks,
    note,
    updated_at: changed_at,
    history,
  };
}

export function apply_material_review_record(
  segment: material_segment,
  record: material_review_record | undefined,
): material_segment {
  if (!record || record.content_sha256 !== segment.sha256) {
    return segment;
  }
  if (
    record.status === "published" &&
    get_publish_block_reason(segment, record.checks)
  ) {
    return segment;
  }

  return {
    ...segment,
    status: record.status,
    realtime_judgement_allowed: can_use_for_realtime_judgement(record.status),
  };
}

export function apply_material_review_records(
  catalog: material_catalog,
  records: material_review_records,
): material_catalog {
  return {
    ...catalog,
    materials: catalog.materials.map((material) => apply_collection_records(material, records)),
  };
}

function apply_collection_records(
  material: material_collection,
  records: material_review_records,
): material_collection {
  return {
    ...material,
    segments: material.segments.map((segment) =>
      apply_material_review_record(segment, get_material_review_record(records, segment))),
  };
}

function requires_audit_note(status: material_review_status): boolean {
  return status === "validation_failed" ||
    status === "verified" ||
    status === "published" ||
    status === "rejected";
}

function parse_material_review_records(value: unknown): material_review_records | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  if (payload.schema_version !== 1 || !payload.records || typeof payload.records !== "object") {
    return undefined;
  }

  const records = Object.entries(payload.records as Record<string, unknown>).reduce<
    Record<string, material_review_record>
  >((result, [segment_id, candidate]) => {
    const record = parse_material_review_record(candidate);
    if (record && record.segment_id === segment_id) {
      result[segment_id] = record;
    }
    return result;
  }, {});

  return {
    schema_version: 1,
    records,
  };
}

function parse_material_review_record(value: unknown): material_review_record | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.segment_id !== "string" ||
    typeof record.content_sha256 !== "string" ||
    !is_review_status(record.status) ||
    typeof record.note !== "string" ||
    typeof record.updated_at !== "string" ||
    !is_review_checklist(record.checks) ||
    !Array.isArray(record.history)
  ) {
    return undefined;
  }

  const history = record.history
    .map(parse_material_review_history)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(-history_limit);

  return {
    segment_id: record.segment_id,
    content_sha256: record.content_sha256,
    status: record.status,
    checks: record.checks,
    note: record.note,
    updated_at: record.updated_at,
    history,
  };
}

function parse_material_review_history(
  value: unknown,
): material_review_record["history"][number] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entry = value as Record<string, unknown>;
  if (
    !is_review_status(entry.from_status) ||
    !is_review_status(entry.to_status) ||
    typeof entry.changed_at !== "string" ||
    typeof entry.note !== "string"
  ) {
    return undefined;
  }

  return {
    from_status: entry.from_status,
    to_status: entry.to_status,
    changed_at: entry.changed_at,
    note: entry.note,
  };
}

function is_review_status(value: unknown): value is material_review_status {
  return typeof value === "string" && review_statuses.has(value as material_review_status);
}

function is_review_checklist(value: unknown): value is material_review_checklist {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const checks = value as Record<string, unknown>;
  return typeof checks.structure_checked === "boolean" &&
    typeof checks.music_semantics_checked === "boolean" &&
    typeof checks.visual_pdf_checked === "boolean" &&
    typeof checks.source_mapping_checked === "boolean";
}
