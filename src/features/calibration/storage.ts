import type { score_document } from "@/features/score";

import {
  calibration_levels,
  type calibration_project,
  type calibration_work_metadata,
} from "./types";

const storage_key = "panio.calibration.projects.v1";

export function create_calibration_project(
  work: Partial<calibration_work_metadata> = {},
): calibration_project {
  const id = create_id();
  const now = new Date().toISOString();
  const title = work.opus
    ? `${work.composer || "未命名作者"} ${work.opus}`
    : "未命名校准项目";
  return {
    schema_version: 1,
    id,
    title,
    work: {
      composer: work.composer ?? "",
      opus: work.opus ?? "",
      edition: work.edition ?? "",
      publisher: work.publisher ?? "",
      source: work.source ?? "",
    },
    source: {
      file_name: null,
      mime_type: null,
      page_count: null,
      attached_at: null,
    },
    musicxml: null,
    document: create_empty_document(id, title),
    event_metadata: {},
    levels: Object.fromEntries(calibration_levels.map((level) => [
      level,
      { status: "pending", confirmed_at: null },
    ])) as calibration_project["levels"],
    updated_at: now,
  };
}

export function load_calibration_projects(
  storage: Pick<Storage, "getItem"> = localStorage,
): calibration_project[] {
  try {
    const value = storage.getItem(storage_key);
    if (!value) {
      return [];
    }
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(is_calibration_project)
      : [];
  } catch {
    return [];
  }
}

export function save_calibration_projects(
  projects: calibration_project[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(storage_key, JSON.stringify(projects.map((project) => ({
    ...project,
    musicxml: null,
  }))));
}

export function upsert_calibration_project(
  projects: calibration_project[],
  project: calibration_project,
): calibration_project[] {
  const next_project = {
    ...project,
    updated_at: new Date().toISOString(),
  };
  const index = projects.findIndex((candidate) => candidate.id === project.id);
  if (index < 0) {
    return [next_project, ...projects];
  }
  return projects.map((candidate) =>
    candidate.id === project.id ? next_project : candidate);
}

export function remove_calibration_project(
  projects: calibration_project[],
  project_id: string,
): calibration_project[] {
  return projects.filter((project) => project.id !== project_id);
}

function create_empty_document(id: string, title: string): score_document {
  const now = new Date().toISOString();
  return {
    schema_version: 2,
    id: `score-${id}`,
    number: null,
    title,
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status: "published",
    provenance: {
      kind: "manual",
      source_id: null,
      source_file: null,
      source_sha256: null,
      font_config_version: null,
      importer_version: "calibration-workbench/v1",
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures: [],
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: "calibration-workbench",
      published_at: now,
      note: "Local calibration source",
    },
  };
}

function is_calibration_project(value: unknown): value is calibration_project {
  if (!value || typeof value !== "object") {
    return false;
  }
  const project = value as Partial<calibration_project>;
  return project.schema_version === 1 &&
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    project.document?.schema_version === 2 &&
    project.levels !== undefined;
}

function create_id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `calibration-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
