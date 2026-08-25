import type {
  material_fingering_annotation,
  note_fingering,
  material_review_status,
} from "@/features/assets/types";
import type { score_document_v2 } from "@/features/score";

export type { note_fingering } from "@/features/assets/types";

export type hand_mode = "right" | "left" | "both";

export type material_kind =
  | "beyer"
  | "hanon"
  | "john-thompson-easiest-1"
  | "john-thompson-easiest-2"
  | "warmup"
  | "scale"
  | "chord"
  | "piece"
  | "sight_reading";

export type exercise_type =
  | "warmup"
  | "method"
  | "technique"
  | "repertoire"
  | "sight_reading";

export type practice_mode = "guided_input" | "timed_reading" | "manual_checklist";

export type step_match_mode = "single_note" | "chord";

export type score_source_kind = "inline" | "reference" | "musicxml";

export type score_source_status = material_review_status
  | "reference_only"
  | "awaiting_import";

export interface course {
  id: string;
  title: string;
  short_title: string;
  goal: string;
  material_note: string;
  completion_standards: string[];
  order: number;
  week_start: number;
  week_end: number;
  available: boolean;
}

export interface expected_step {
  id: string;
  measure_index: number;
  beat_index: number;
  beat_in_measure?: number;
  notation: string;
  note_names: string[];
  notes: number[];
  fingerings?: note_fingering[];
  held_hands?: Array<"right" | "left">;
  hand: hand_mode;
  duration_beats: number;
  match_mode: step_match_mode;
}

export interface score_source_excerpt {
  asset_id: string;
  label: string;
  measure_start?: number;
  measure_end?: number;
  musicxml_url?: string;
  practice_events_url?: string;
  content_sha256?: string;
  render_measure_start?: number;
  render_measure_end?: number;
}

export interface score_source_reference_image {
  url: string;
  alt: string;
  title?: string;
  caption?: string;
}

export interface fingering_guide {
  preparation: string[];
  actions: string[];
  success_checks: string[];
  common_mistakes: string[];
  position_strategy: string[];
  fingering_rules: string[];
  self_check: string[];
  position_map: Array<{
    label: string;
    start_note: string;
    notes: string[];
    fingers: string[];
    applies_to: string;
    reason: string;
    movement?: "stay" | "move" | "return";
  }>;
}

export interface practice_score {
  id: string;
  score_version_id?: string;
  score_document?: score_document_v2;
  title: string;
  key_signature: string;
  jianpu_tonic_midi: number;
  time_signature: string;
  beats_per_measure: number;
  tempo_hint: string;
  start_position: string;
  finger_hint: string;
  finger_guide: fingering_guide;
  source: {
    kind: score_source_kind;
    status: score_source_status;
    label: string;
    asset_id?: string;
    source_page?: number;
    musicxml_url?: string;
    practice_events_url?: string;
    content_sha256?: string;
    excerpt_label?: string;
    measure_start?: number;
    measure_end?: number;
    render_measure_start?: number;
    render_measure_end?: number;
    excerpts?: score_source_excerpt[];
    reference_image?: score_source_reference_image;
  };
  source_fingering?: material_fingering_annotation[];
  measure_beats?: number[];
  measure_beat_units?: number[];
  steps: expected_step[];
}

export interface lesson {
  id: string;
  course_id: string;
  week_number: number;
  day_index: 1 | 2 | 3;
  title: string;
  description: string;
  guidance: string;
  objective: string;
  hand_mode: hand_mode;
  target_bpm: number;
  pass_accuracy?: number;
  estimated_minutes: number;
  material_kind: material_kind;
  exercise_type: exercise_type;
  practice_mode: practice_mode;
  source_ref?: string;
  score: practice_score;
  steps?: expected_step[];
}

export interface practice_day {
  id: string;
  course_id: string;
  week_number: number;
  day_index: 1 | 2 | 3;
  title: string;
  objective: string;
  time_budget_minutes: number;
  lesson_ids: string[];
}

export interface practice_result {
  lesson_id: string;
  started_at: number;
  completed_at: number;
  total_steps: number;
  correct_steps: number;
  mistakes: number;
  early_steps: number;
  late_steps: number;
  max_combo: number;
  accuracy: number;
  completed: boolean;
  note?: string;
  input_source?: normalized_note_event["source"] | "manual";
  bpm?: number;
  last_measure_index?: number;
  duration_ms?: number;
}

export interface user_progress {
  schema_version: 2;
  start_date?: string;
  current_phase_id: string;
  current_week_number: number;
  current_day_index: 1 | 2 | 3;
  completed_lesson_ids: string[];
  results_by_lesson: Record<string, practice_result[]>;
  weak_lesson_ids: string[];
  last_practiced_on?: string;
  streak_days: number;
}

export interface normalized_note_event {
  type: "note_on" | "note_off";
  note: number;
  velocity: number;
  timestamp: number;
  source: "midi" | "keyboard" | "microphone" | "virtual_piano";
}
