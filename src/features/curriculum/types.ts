import type { score_document_v2 } from "@/features/score";

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

export interface lesson_score_binding_record {
  id: string;
  lesson_node_id: string;
  score_version_id: string;
  role: "primary" | "reference" | "practice_events";
  position: number;
  settings: Record<string, unknown>;
}

export interface published_curriculum_score_version {
  id: string;
  score_id: string;
  version_number: number;
  source_sha256: string;
  document: score_document_v2;
  created_at: string;
  published_at: string;
}

export interface active_curriculum {
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
  lesson_score_bindings: lesson_score_binding_record[];
  score_versions: published_curriculum_score_version[];
}

export interface curriculum_node_tree extends curriculum_node_record {
  children: curriculum_node_tree[];
}
