import type {
  score_document,
  score_document_input,
  score_document_status,
} from "./types";

export interface score_document_migration_options {
  document_status?: score_document_status;
  source_sha256?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  published_by?: string | null;
  published_at?: string | null;
}

export function migrate_score_document(
  document: score_document_input,
  options?: score_document_migration_options,
): score_document;
