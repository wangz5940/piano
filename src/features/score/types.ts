export type score_hand = "left" | "right";
export type score_finger = 1 | 2 | 3 | 4 | 5;
export type score_document_status = "candidate" | "needs_review" | "reviewed" | "published";
export type score_annotation_source = "pptx" | "generated" | "manual" | "legacy";
export type score_annotation_status = "candidate" | "needs_review" | "confirmed" | "published" | "rejected";
export type score_hand_position_movement = "stay" | "move" | "return";
export type hymn_review_state = "candidate" | "needs_review" | "reviewed" | "published";
export type hymn_review_issue_kind =
  | "unknown_glyph"
  | "structural"
  | "source"
  | "other";
export type hymn_review_issue_status = "unresolved" | "resolved";

export interface score_source_reference {
  slide_number: number;
  shape_id: string;
  paragraph_index: number | null;
  run_index: number | null;
}

export interface hymn_review_issue {
  id: string;
  code: string;
  kind: hymn_review_issue_kind;
  severity: "warning" | "error";
  status: hymn_review_issue_status;
  message: string;
  source_refs: score_source_reference[];
}

export interface hymn_review_slide {
  slide_number: number;
  source_svg: string;
  normalized_svg: string;
  source_svg_sha256: string;
  normalized_svg_sha256: string;
  source_refs: score_source_reference[];
}

export interface hymn_review_record {
  review_state: hymn_review_state;
  font_config_version: string;
  document_sha256: string;
  derived_hash: string;
  slides: hymn_review_slide[];
  issues: hymn_review_issue[];
}

export interface score_annotation {
  source: score_annotation_source;
  status: score_annotation_status;
  reason: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  source_refs: score_source_reference[];
}

export interface score_document_provenance {
  kind: "pptx" | "manual" | "legacy";
  source_id: string | null;
  source_file: string | null;
  source_sha256: string | null;
  font_config_version: string | null;
  importer_version: string | null;
  references: score_source_reference[];
}

export interface score_document_review {
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_by: string | null;
  published_at: string | null;
  note: string | null;
}

export interface score_time_point {
  measure_id: string;
  beat: number;
}

export interface score_time_range {
  start: score_time_point;
  end: score_time_point;
}

export interface score_lyric {
  id: string;
  stanza_number: number;
  text: string;
  language: string | null;
  event_ids: string[];
  range: score_time_range | null;
  slide_number: number | null;
  annotation: score_annotation;
}

export interface score_hand_position_finger {
  finger: score_finger;
  midi: number;
}

export interface score_hand_position_segment {
  id: string;
  hand: score_hand;
  range: score_time_range;
  position_name: string;
  covered_midis: number[];
  finger_map: score_hand_position_finger[];
  movement: score_hand_position_movement;
  annotation: score_annotation;
}

export interface score_document_note_v1 {
  id: string;
  midi: number;
  finger?: score_finger;
}

export interface score_document_event_v1 {
  id: string;
  onset_beats: number;
  duration_beats: number;
  hand: score_hand;
  voice: number;
  notes: score_document_note_v1[];
  chord?: string;
}

export interface score_document_measure_v1 {
  id: string;
  number: string;
  meter: { beats: number; beat_unit: number };
  events: score_document_event_v1[];
}

export interface score_document_v1 {
  schema_version: 1;
  id: string;
  title: string;
  key_signature: string;
  tonic_midi: number;
  time_signature: string;
  measures: score_document_measure_v1[];
}

export interface score_document_note extends score_document_note_v1 {
  fingering?: score_annotation;
  source_refs?: score_source_reference[];
}

export interface score_document_event extends Omit<score_document_event_v1, "notes"> {
  notes: score_document_note[];
  chord_annotation?: score_annotation;
  teaching_role?: "left_hand_suggestion";
  tie?: "start" | "continue" | "stop";
  sustain?: boolean;
  source_refs?: score_source_reference[];
}

export interface score_document_measure {
  id: string;
  number: string;
  meter: { beats: number; beat_unit: number };
  events: score_document_event[];
}

export interface score_document_v2 {
  schema_version: 2;
  id: string;
  number: string | null;
  title: string;
  key_signature: string;
  tonic_midi: number;
  time_signature: string;
  status: score_document_status;
  provenance: score_document_provenance;
  lyrics: score_lyric[];
  hand_positions: score_hand_position_segment[];
  measures: score_document_measure[];
  review: score_document_review;
}

export type score_document = score_document_v2;
export type score_document_input = score_document_v1 | score_document_v2;
