import type { user_progress } from "@/features/course/types";
import type { hymn_review_record, score_document } from "@/features/score";
import type { app_settings } from "@/features/settings/storage";

export type {
  score_document,
  score_document_event,
  score_document_measure,
  score_document_note,
} from "@/features/score";

export type user_role = "student" | "parent" | "teacher" | "admin";

export interface account_user {
  id: string;
  email: string;
  display_name: string;
  role: user_role;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
}

export interface user_snapshot {
  revision: number;
  progress: user_progress;
  preferences: app_settings;
  updated_at: string;
}

export interface auth_response {
  user: account_user;
  snapshot: user_snapshot;
}

export interface practice_summary {
  practice_count: number;
  total_duration_ms: number;
  average_accuracy: number;
  last_practiced_at?: number;
  input_sources: Array<{
    input_source: string;
    count: number;
  }>;
  weak_lessons: Array<{
    lesson_id: string;
    attempts: number;
    average_accuracy: number;
    mistakes: number;
  }>;
}

export interface content_version_record {
  id: string;
  content_id: string;
  version_number: number;
  source_sha256: string;
  created_at: string;
  published_at?: string;
  musicxml_url: string;
  practice_data_url?: string;
}

export interface managed_content {
  id: string;
  kind: "material" | "course" | "exercise" | "piece";
  title: string;
  status: "draft" | "published" | "archived";
  metadata: {
    difficulty?: string;
    key_signature?: string;
    time_signature?: string;
    hand_mode?: "left" | "right" | "both";
    learning_goal?: string;
    recommended_weeks?: string;
    rights_note?: string;
    attribution?: string;
  };
  current_version_id?: string;
  created_at: string;
  updated_at: string;
  versions: content_version_record[];
}

export interface curriculum_node_record {
  id: string;
  revision_id: string;
  parent_id?: string;
  kind: "stage" | "week" | "practice_day" | "lesson";
  title: string;
  position: number;
  payload: Record<string, unknown>;
  status: "active" | "archived";
  updated_at: string;
}

export interface managed_curriculum {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  active_revision_id?: string;
  revision: {
    id: string;
    version_number: number;
    status: "draft" | "published" | "archived";
    title: string;
    description: string;
    published_at?: string;
  };
  nodes: curriculum_node_record[];
}

export interface score_version_record {
  id: string;
  score_id: string;
  version_number: number;
  source_sha256: string;
  document: score_document;
  hymn_review?: hymn_review_record;
  created_at: string;
  published_at?: string;
}

export interface score_draft_record {
  id: string;
  score_id: string;
  base_version_id?: string;
  document: score_document;
  hymn_review?: hymn_review_record;
  updated_at: string;
}

export interface managed_score {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  metadata: Record<string, unknown>;
  current_version_id?: string;
  created_at: string;
  updated_at: string;
  versions: score_version_record[];
  drafts: score_draft_record[];
}
