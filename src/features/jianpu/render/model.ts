export type jianpu_hand = "right" | "left";
export type jianpu_render_mode = "reading" | "practice";
export type jianpu_accidental = "" | "#" | "b" | "natural";
export type jianpu_event_kind = "note" | "rest" | "sustain";
export type jianpu_annotation_source = "pptx" | "generated" | "manual" | "legacy";
export type jianpu_annotation_status = "candidate" | "needs_review" | "confirmed" | "published" | "rejected";

export interface jianpu_meter {
  beats: number;
  beat_unit: number;
}

export interface jianpu_render_note {
  midi: number;
  degree: "1" | "2" | "3" | "4" | "5" | "6" | "7";
  accidental: jianpu_accidental;
  octave_offset: number;
  keyboard_label: string;
  finger?: 1 | 2 | 3 | 4 | 5;
  fingering_source?: jianpu_annotation_source;
  fingering_status?: jianpu_annotation_status;
  fingering_reason?: string;
}

export interface jianpu_tie_info {
  id: string;
  role: "start" | "continue" | "stop";
  source_event_id?: string;
}

export interface jianpu_event_markings {
  dynamics?: string;
  articulation?: string;
  slur?: "none" | "start" | "continue" | "stop";
  clef?: "treble" | "bass" | "alto" | "tenor" | "percussion" | "unknown";
  staff?: number;
}

export interface jianpu_source_ref {
  source: "jianpu_score" | "practice_score" | "score_document";
  source_id: string;
  event_index: number;
  step_index?: number;
}

export interface jianpu_render_hand_event {
  id: string;
  hand: jianpu_hand;
  kind: jianpu_event_kind;
  onset_beats: number;
  duration_beats: number;
  notes: jianpu_render_note[];
  voice?: number;
  tie?: jianpu_tie_info;
  markings?: jianpu_event_markings;
  source_ref: jianpu_source_ref;
}

export interface jianpu_chord_label {
  id: string;
  onset_beats: number;
  text: string;
  source?: jianpu_annotation_source;
  status?: jianpu_annotation_status;
  reason?: string;
}

export interface jianpu_lyric_label {
  id: string;
  onset_beats: number;
  text: string;
  stanza_number: number;
  source: jianpu_annotation_source;
  status: jianpu_annotation_status;
  reason: string;
}

export interface jianpu_hand_position_label {
  label: string;
  notes: string[];
  fingers: string[];
  movement: "stay" | "move" | "return";
  reason: string;
  hand?: jianpu_hand;
  source?: jianpu_annotation_source;
  status?: jianpu_annotation_status;
}

export type jianpu_warning_code =
  | "measure_content_exceeds_declared_beats"
  | "measure_content_shorter_than_declared_beats"
  | "event_overlaps_existing_event"
  | "missing_voice_information";

export interface jianpu_render_warning {
  code: jianpu_warning_code;
  measure_index: number;
  message: string;
  hand?: jianpu_hand;
}

export interface jianpu_render_measure {
  id: string;
  index: number;
  number: string;
  directions: string[];
  meter: jianpu_meter;
  content_beats: number;
  warnings: jianpu_render_warning[];
  hand_position?: jianpu_hand_position_label;
  right: jianpu_render_hand_event[];
  left: jianpu_render_hand_event[];
  chord_labels: jianpu_chord_label[];
  lyric_labels: jianpu_lyric_label[];
}

export interface jianpu_render_score {
  id: string;
  title?: string;
  key_signature: string;
  tonic_midi: number;
  scale_intervals: readonly number[];
  accidental_preference: "sharp" | "flat";
  time_signature: string;
  measures: jianpu_render_measure[];
}

export interface jianpu_note_box {
  note: jianpu_render_note;
  x: number;
  y: number;
}

export interface jianpu_fingering_box {
  note_midi: number;
  finger: 1 | 2 | 3 | 4 | 5;
  source?: jianpu_annotation_source;
  status?: jianpu_annotation_status;
  reason?: string;
  x: number;
  y: number;
}

export interface jianpu_hold_segment_box {
  x: number;
  y: number;
  width: number;
}

export interface jianpu_event_box {
  event: jianpu_render_hand_event;
  x: number;
  y: number;
  width: number;
  note_boxes: jianpu_note_box[];
  fingering_boxes: jianpu_fingering_box[];
  hold_segments: jianpu_hold_segment_box[];
}

export interface jianpu_measure_box {
  measure: jianpu_render_measure;
  x: number;
  y: number;
  width: number;
  height: number;
  content_x: number;
  content_width: number;
  layout_beats: number;
  right_events: jianpu_event_box[];
  left_events: jianpu_event_box[];
}

export interface jianpu_hand_row_box {
  hand: jianpu_hand;
  top: number;
  height: number;
  baseline: number;
}

export interface jianpu_system_box {
  index: number;
  is_final_system: boolean;
  width: number;
  height: number;
  has_right_hand: boolean;
  has_left_hand: boolean;
  gutter_width: number;
  right_row?: jianpu_hand_row_box;
  left_row?: jianpu_hand_row_box;
  measures: jianpu_measure_box[];
  warnings: jianpu_render_warning[];
}

export interface jianpu_score_layout {
  width: number;
  systems: jianpu_system_box[];
}

export interface jianpu_layout_options {
  container_width: number;
  mode: jianpu_render_mode;
}

export interface jianpu_render_view_state {
  mode: jianpu_render_mode;
  current_event_id?: string;
  on_event_select?: (event_id: string) => void;
  completed_event_ids: ReadonlySet<string>;
  show_fingerings: boolean;
  show_keyboard_aid: boolean;
}
