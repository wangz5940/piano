import type { material_id } from "@/features/assets/types";

export type jianpu_hand_mode = "right" | "left" | "both";
export type jianpu_slice_mapping = "verified" | "cross_page";

export interface jianpu_page {
  page: number;
  title: string;
  text: string;
  exercise_labels: string[];
  section_title?: string;
}

export interface jianpu_page_slice {
  source_pages: number[];
  title: string;
  text: string;
  measure_start: number;
  measure_end: number;
  chapter_id: string;
  chapter_title: string;
  mapping: jianpu_slice_mapping;
}

export interface jianpu_chapter {
  id: string;
  title: string;
  description: string;
  page_start: number;
  page_end: number;
}

export interface jianpu_segment {
  id: string;
  deletion_status?: "active" | "deleted";
  deleted_at?: string;
  sequence: number;
  title: string;
  source_pages: number[];
  source_page_label: string;
  page_slices: jianpu_page_slice[];
  exercise_labels: string[];
  section_title?: string;
  jianpu_url: string;
  musicxml_url: string;
  measure_count: number;
  time_signature: string;
  key_signature: string;
  tonic_midi: number;
  hand_mode: jianpu_hand_mode;
  has_left_hand: boolean;
  chord_count: number;
}

export interface jianpu_material {
  id: material_id;
  title: string;
  description: string;
  page_count: number;
  pages: jianpu_page[];
  chapters: jianpu_chapter[];
  segments: jianpu_segment[];
}

export interface jianpu_catalog {
  schema_version: "1.0";
  generated_at: string;
  materials: jianpu_material[];
}

export interface jianpu_event {
  onset_beats: number;
  duration_beats: number;
  right_notes: number[];
  left_notes: number[];
  right_fingerings?: jianpu_event_fingering[];
  left_fingerings?: jianpu_event_fingering[];
  chord?: string;
}

export interface jianpu_event_fingering {
  note: number;
  finger: 1 | 2 | 3 | 4 | 5;
  source?: "score" | "manual" | "generated";
}

export interface jianpu_measure {
  index: number;
  number: string;
  directions: string[];
  events: jianpu_event[];
}

export interface jianpu_score {
  schema_version: "1.0";
  segment_id: string;
  key_signature: string;
  tonic_midi: number;
  time_signature: string;
  measures: jianpu_measure[];
}
