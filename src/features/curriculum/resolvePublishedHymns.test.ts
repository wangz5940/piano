import { describe, expect, it } from "vitest";

import {
  hymn_repertoire_entries,
  legacy_hymn_fallback_by_number,
  legacy_hymn_fallback_by_score_id,
  legacy_hymn_fallback_entries,
} from "@/features/repertoire/hymns";
import type { score_document_status, score_document_v2 } from "@/features/score";

import { resolve_published_hymn_entries } from "./resolvePublishedHymns";
import type {
  active_curriculum,
  published_curriculum_score_version,
} from "./types";

describe("resolve_published_hymn_entries", () => {
  it("固定保留 12 首 legacy seeds 和兼容导出", () => {
    expect(legacy_hymn_fallback_entries).toHaveLength(12);
    expect(hymn_repertoire_entries).toBe(legacy_hymn_fallback_entries);
    expect(legacy_hymn_fallback_by_number).toHaveLength(12);
    expect(legacy_hymn_fallback_by_score_id).toHaveLength(12);
    expect(legacy_hymn_fallback_by_number.get("001")?.id)
      .toBe("hymn-001-great-physician");
    expect(legacy_hymn_fallback_by_score_id.get("hymn-371")?.id)
      .toBe("hymn-371-jesus-loves-me");
  });

  it("已发布绑定覆盖对应 fallback，并加入其他已发布诗歌且去重", () => {
    const curriculum = make_curriculum([
      version("score-371-v2", "hymn-371", "371", "耶稣爱我 · 校对版"),
      version("score-999-v1", "hymn-999", "999", "新增诗歌"),
      version("score-999-v2", "hymn-999", "999", "新增诗歌新版", 2),
    ]);

    const entries = resolve_published_hymn_entries(curriculum);

    expect(entries).toHaveLength(13);
    expect(entries.find((entry) =>
      entry.id === "hymn-371-jesus-loves-me")).toMatchObject({
        title: "《耶稣爱我 · 校对版》",
        score: {
          score_version_id: "score-371-v2",
          source: { status: "published" },
        },
      });
    expect(entries.filter((entry) => entry.id === "hymn-999")).toHaveLength(1);
    expect(entries.find((entry) => entry.id === "hymn-999")?.score
      .score_version_id).toBe("score-999-v2");
  });

  it("candidate、未发布或未绑定版本不进入，缺少发布版时使用 fallback", () => {
    const candidate = version(
      "score-240-candidate",
      "hymn-240",
      "240",
      "候选不应出现",
      1,
      "candidate",
    );
    const unbound = version(
      "score-998-v1",
      "hymn-998",
      "998",
      "未绑定不应出现",
    );
    const curriculum = make_curriculum([candidate, unbound]);
    curriculum.lesson_score_bindings = [{
      id: "binding-candidate",
      lesson_node_id: "lesson-1",
      score_version_id: candidate.id,
      role: "primary",
      position: 1,
      settings: {},
    }];

    const entries = resolve_published_hymn_entries(curriculum);

    expect(entries).toHaveLength(12);
    expect(entries.find((entry) =>
      entry.id === "hymn-240-tis-so-sweet-to-trust-in-jesus")?.score
      .score_version_id).toBeUndefined();
    expect(entries.some((entry) => entry.id === "hymn-998")).toBe(false);
    expect(resolve_published_hymn_entries(undefined))
      .toEqual(legacy_hymn_fallback_entries);
  });
});

function make_curriculum(
  score_versions: published_curriculum_score_version[],
): active_curriculum {
  return {
    id: "curriculum-1",
    slug: "default",
    title: "练琴簿课程",
    status: "published",
    active_revision_id: "revision-2",
    revision: {
      id: "revision-2",
      version_number: 2,
      status: "published",
      title: "课程第二版",
      description: "发布诗歌绑定。",
      published_at: "2026-07-24T08:00:00.000Z",
    },
    nodes: [{
      id: "lesson-1",
      revision_id: "revision-2",
      kind: "lesson",
      title: "诗歌练习",
      position: 1,
      payload: {},
      status: "active",
      updated_at: "2026-07-24T08:00:00.000Z",
    }],
    lesson_score_bindings: score_versions.map((score_version, index) => ({
      id: `binding-${index + 1}`,
      lesson_node_id: "lesson-1",
      score_version_id: score_version.id,
      role: "primary",
      position: index + 1,
      settings: {},
    })),
    score_versions,
  };
}

function version(
  id: string,
  score_id: string,
  number: string,
  title: string,
  version_number = 1,
  status: score_document_status = "published",
): published_curriculum_score_version {
  const published_at = "2026-07-24T08:00:00.000Z";
  return {
    id,
    score_id,
    version_number,
    source_sha256: "a".repeat(64),
    document: document(number, title, status, published_at),
    created_at: "2026-07-24T07:00:00.000Z",
    published_at,
  };
}

function document(
  number: string,
  title: string,
  status: score_document_status,
  published_at: string,
): score_document_v2 {
  return {
    schema_version: 2,
    id: `hymn-${number}`,
    number,
    title,
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status,
    provenance: {
      kind: "pptx",
      source_id: `hymn-pptx-${number}`,
      source_file: `${number} ${title}.pptx`,
      source_sha256: "b".repeat(64),
      font_config_version: "font-v1",
      importer_version: "importer-v1",
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures: [],
    review: {
      reviewed_by: "reviewer",
      reviewed_at: published_at,
      published_by: status === "published" ? "publisher" : null,
      published_at: status === "published" ? published_at : null,
      note: null,
    },
  };
}
