import {
  legacy_hymn_fallback_by_number,
  legacy_hymn_fallback_by_score_id,
  legacy_hymn_fallback_entries,
  normalize_hymn_number,
  type hymn_repertoire_entry,
} from "@/features/repertoire/hymns";
import { to_practice_score } from "@/features/score/toPracticeScore";

import type {
  active_curriculum,
  published_curriculum_score_version,
} from "./types";

export function resolve_published_hymn_entries(
  curriculum: active_curriculum | undefined,
): hymn_repertoire_entry[] {
  const published_by_identity = collect_published_versions(curriculum);
  const used_identities = new Set<string>();

  const resolved_fallbacks = legacy_hymn_fallback_entries.map((fallback) => {
    const number = get_fallback_number(fallback);
    const score_id = number ? `hymn-${number}` : undefined;
    const version = score_id && number
      ? published_by_identity.get(score_id) ??
        published_by_identity.get(number)
      : undefined;
    if (!version) {
      return fallback;
    }
    used_identities.add(version_identity(version));
    return to_repertoire_entry(version, fallback);
  });

  const additional = [...published_by_identity.values()]
    .filter((version) => !used_identities.has(version_identity(version)))
    .map((version) => to_repertoire_entry(version))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));

  return deduplicate_entries([...resolved_fallbacks, ...additional]);
}

function collect_published_versions(
  curriculum: active_curriculum | undefined,
): Map<string, published_curriculum_score_version> {
  if (
    !curriculum ||
    curriculum.status !== "published" ||
    curriculum.revision.status !== "published"
  ) {
    return new Map();
  }

  const bound_version_ids = new Set(
    curriculum.lesson_score_bindings.map(
      (binding) => binding.score_version_id,
    ),
  );
  const selected = new Map<string, published_curriculum_score_version>();
  for (const version of curriculum.score_versions) {
    if (
      !bound_version_ids.has(version.id) ||
      !version.published_at ||
      version.document.status !== "published" ||
      version.document.review.published_at === null
    ) {
      continue;
    }
    const identity = version_identity(version);
    const current = selected.get(identity);
    if (!current || version.version_number > current.version_number) {
      selected.set(identity, version);
    }
  }
  return selected;
}

function to_repertoire_entry(
  version: published_curriculum_score_version,
  fallback?: hymn_repertoire_entry,
): hymn_repertoire_entry {
  const number = version.document.number
    ? normalize_hymn_number(version.document.number)
    : undefined;
  return {
    id: fallback?.id ?? version.score_id,
    title: format_hymn_title(version.document.title),
    attribution:
      fallback?.attribution ??
      (number ? `诗歌 ${number} · 已发布校对谱` : "已发布诗歌校对谱"),
    level: fallback?.level ?? "基础",
    recommended_weeks: fallback?.recommended_weeks ?? "已发布诗歌曲目",
    learning_goal:
      fallback?.learning_goal ??
      "按已审核 ScoreDocument 练习歌词、指法、手位与和弦。",
    rights_note:
      "来自已审核发布的 PPTX/ScoreDocument 版本；来源与教学标注可追溯。",
    score: to_practice_score(version),
  };
}

function version_identity(
  version: published_curriculum_score_version,
): string {
  return version.document.number
    ? normalize_hymn_number(version.document.number)
    : version.score_id;
}

function get_fallback_number(
  fallback: hymn_repertoire_entry,
): string | undefined {
  for (const [number, entry] of legacy_hymn_fallback_by_number) {
    if (entry.id === fallback.id) {
      return number;
    }
  }
  for (const [score_id, entry] of legacy_hymn_fallback_by_score_id) {
    if (entry.id === fallback.id) {
      return score_id.replace(/^hymn-/u, "");
    }
  }
  return undefined;
}

function deduplicate_entries(
  entries: hymn_repertoire_entry[],
): hymn_repertoire_entry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

function format_hymn_title(title: string): string {
  return title.startsWith("《") ? title : `《${title}》`;
}
