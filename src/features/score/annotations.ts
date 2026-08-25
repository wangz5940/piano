import type { score_annotation } from "./types";

export function create_score_annotation(
  source: score_annotation["source"],
  status: score_annotation["status"],
  reason: string,
  source_refs: score_annotation["source_refs"] = [],
): score_annotation {
  return {
    source,
    status,
    reason,
    confirmed_by: null,
    confirmed_at: null,
    source_refs,
  };
}

export function create_manual_fingering_annotation(
  reason = "校准台手动修正指法。",
  source_refs: score_annotation["source_refs"] = [],
): score_annotation {
  return create_score_annotation("manual", "published", reason, source_refs);
}

export function create_imported_fingering_annotation(
  reason = "从 MusicXML technical/fingering 导入。",
  source_refs: score_annotation["source_refs"] = [],
): score_annotation {
  return create_score_annotation("legacy", "needs_review", reason, source_refs);
}
