import type {
  score_document,
  score_hand,
} from "@/features/score";

export type calibration_level = "L0" | "L1" | "L2" | "L3";
export type calibration_level_status = "pending" | "in_progress" | "passed";
export type calibration_issue_severity = "warning" | "error";

export interface calibration_work_metadata {
  composer: string;
  opus: string;
  edition: string;
  publisher: string;
  source: string;
}

export interface calibration_source {
  file_name: string | null;
  mime_type: string | null;
  page_count: number | null;
  attached_at: string | null;
}

export interface calibration_material_chapter {
  id: string;
  title: string;
  description: string;
  page_start: number;
  page_end: number;
}

export interface calibration_material_catalog {
  material_id: string;
  title: string;
  chapters: calibration_material_chapter[];
}

export interface calibration_event_metadata {
  event_id: string;
  staff: number;
  hand: score_hand;
  clef: "treble" | "bass" | "alto" | "tenor" | "percussion" | "unknown";
  pitch_name?: string;
  duration_label?: string;
  beat_position?: string;
  measure_label?: string;
  accidental?: string;
  rest?: string;
  tempo?: string;
  repeat?: string;
  articulation: string;
  dynamics: string;
  slur: "none" | "start" | "continue" | "stop";
  source_page: number | null;
  source_system: number | null;
}

export interface calibration_level_state {
  status: calibration_level_status;
  confirmed_at: string | null;
}

export interface calibration_project {
  schema_version: 1;
  id: string;
  title: string;
  work: calibration_work_metadata;
  source: calibration_source;
  material_catalog?: calibration_material_catalog;
  musicxml: string | null;
  document: score_document;
  event_metadata: Record<string, calibration_event_metadata>;
  levels: Record<calibration_level, calibration_level_state>;
  updated_at: string;
}

export interface calibration_issue {
  id: string;
  level: calibration_level;
  severity: calibration_issue_severity;
  code: string;
  message: string;
  measure_id?: string;
  event_id?: string;
  note_id?: string;
}

export interface calibration_validation_result {
  issues: calibration_issue[];
  by_level: Record<
    calibration_level,
    {
      errors: number;
      warnings: number;
      passed: boolean;
    }
  >;
}

export interface golden_score_export {
  schema: "panio-golden-score/v1";
  exported_at: string;
  project_id: string;
  title: string;
  work: calibration_work_metadata;
  source: calibration_source;
  levels: Record<calibration_level, calibration_level_state>;
  validation: calibration_validation_result["by_level"];
  document: score_document;
  event_metadata: Record<string, calibration_event_metadata>;
}

export const calibration_levels: readonly calibration_level[] = [
  "L0",
  "L1",
  "L2",
  "L3",
];
