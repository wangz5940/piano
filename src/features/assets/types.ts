export type material_id =
  | "beyer"
  | "hanon"
  | "john-thompson-easiest-1"
  | "john-thompson-easiest-2";

export type material_review_status =
  | "candidate"
  | "validation_failed"
  | "needs_review"
  | "verified"
  | "published"
  | "rejected";

export type material_mapping_confidence = "source_page" | "exercise_number_verified";

export interface material_section {
  id: string;
  title: string;
}

export interface material_derived_assets {
  source_sha256: string;
  practice_events_url: string;
  preview_url?: string;
  playback_url?: string;
}

export interface material_fingering_rule {
  id: string;
  label: string;
  text: string;
  source: "ocr_text" | "manual_mapping";
  scope?: string;
  hand?: "right" | "left" | "both";
  fingers?: number[];
}

export interface material_fingering_annotation {
  summary: string;
  source_pages: number[];
  rules: material_fingering_rule[];
  limitation: string;
}

export interface note_fingering {
  note: number;
  finger: 1 | 2 | 3 | 4 | 5;
  hand: "right" | "left";
  source: "score" | "generated";
}

export interface material_practice_event {
  id: string;
  measure_index: number;
  measure_number: string;
  onset_beats: number;
  duration_beats: number;
  notes: number[];
  note_names: string[];
  fingerings: note_fingering[];
  notation: string;
  hand: "right" | "left" | "both";
  match_mode: "single_note" | "chord";
}

export interface material_practice_events {
  schema_version: "1.0";
  asset_id: string;
  source_sha256: string;
  events: material_practice_event[];
}

export interface material_review_checklist {
  structure_checked: boolean;
  music_semantics_checked: boolean;
  visual_pdf_checked: boolean;
  source_mapping_checked: boolean;
}

export interface material_review_transition {
  from_status: material_review_status;
  to_status: material_review_status;
  changed_at: string;
  note: string;
}

export interface material_review_record {
  segment_id: string;
  content_sha256: string;
  status: material_review_status;
  checks: material_review_checklist;
  note: string;
  updated_at: string;
  history: material_review_transition[];
}

export interface material_review_records {
  schema_version: 1;
  records: Record<string, material_review_record>;
}

export interface material_segment {
  id: string;
  material_id: material_id;
  deletion_status?: "active" | "deleted";
  deleted_at?: string;
  sequence: number;
  title: string;
  source_pages: number[];
  source_page_label: string;
  ocr_labels: string[];
  ocr_exercise_numbers: number[];
  section?: material_section;
  xml_version: string;
  part_count: number;
  measure_count: number;
  time_signatures: string[];
  musicxml_url: string;
  sha256: string;
  source_status: "candidate";
  status: material_review_status;
  realtime_judgement_allowed: boolean;
  mapping_confidence: material_mapping_confidence;
  fingering_candidates_url?: string;
  derived_assets?: material_derived_assets;
  fingering?: material_fingering_annotation;
}

export interface material_collection {
  id: material_id;
  title: string;
  page_count: number;
  segment_count: number;
  segments: material_segment[];
}

export interface material_catalog {
  schema_version: string;
  generated_at: string;
  review_only: boolean;
  notice: string;
  materials: material_collection[];
}
