import { describe, expect, it } from "vitest";

import { get_lesson } from "@/features/course/data";
import type { score_document_status, score_document_v2 } from "@/features/score";

import {
  resolve_published_lesson,
  resolve_published_lessons,
} from "./resolvePublishedLessons";
import type { active_curriculum } from "./types";

describe("resolve_published_lessons", () => {
  it("从随机节点 ID 还原静态 lesson id，并保留历史课程标识", () => {
    const static_lesson = get_lesson("w9-d1-repertoire")!;
    const curriculum = make_curriculum("published");

    const resolved = resolve_published_lesson(static_lesson, curriculum);

    expect(resolved).not.toBe(static_lesson);
    expect(resolved.id).toBe(static_lesson.id);
    expect(resolved.course_id).toBe(static_lesson.course_id);
    expect(resolved.week_number).toBe(static_lesson.week_number);
    expect(resolved.day_index).toBe(static_lesson.day_index);
    expect(resolved.title).toBe("数据库发布诗歌 · 已发布教学谱");
    expect(resolved.source_ref).toContain("score-371-v2");
    expect(resolved.score.score_version_id).toBe("score-371-v2");
    expect(resolved.steps).toBe(resolved.score.steps);
  });

  it("无 binding 或候选版本时保持静态 lesson", () => {
    const static_lesson = get_lesson("w9-d1-repertoire")!;
    const no_binding = make_curriculum("published");
    no_binding.lesson_score_bindings = [];
    expect(resolve_published_lesson(static_lesson, no_binding))
      .toBe(static_lesson);

    const candidate = make_curriculum("candidate");
    expect(resolve_published_lessons([static_lesson], candidate)[0])
      .toBe(static_lesson);
  });

  it("把数据库 sight_reading 映射到现有 sight lesson id", () => {
    const static_lesson = get_lesson("w9-d1-sight")!;
    const curriculum = make_curriculum("published", "sight_reading");

    expect(resolve_published_lesson(static_lesson, curriculum).id)
      .toBe("w9-d1-sight");
    expect(resolve_published_lesson(static_lesson, curriculum).score
      .score_version_id).toBe("score-371-v2");
  });
});

function make_curriculum(
  status: score_document_status,
  exercise_type = "repertoire",
): active_curriculum {
  const published_at = "2026-07-24T08:00:00.000Z";
  return {
    id: "curriculum",
    slug: "default",
    title: "练琴簿课程",
    status: "published",
    active_revision_id: "revision-random",
    revision: {
      id: "revision-random",
      version_number: 2,
      status: "published",
      title: "第二版",
      description: "已发布绑定",
      published_at,
    },
    nodes: [
      {
        id: "day-random-9-1",
        revision_id: "revision-random",
        kind: "practice_day",
        title: "第九周第一天",
        position: 1,
        payload: { week_number: 9, day_index: 1 },
        status: "active",
        updated_at: published_at,
      },
      {
        id: "lesson-random-primary",
        revision_id: "revision-random",
        parent_id: "day-random-9-1",
        kind: "lesson",
        title: "诗歌",
        position: 4,
        payload: { exercise_type },
        status: "active",
        updated_at: published_at,
      },
    ],
    lesson_score_bindings: [{
      id: "binding",
      lesson_node_id: "lesson-random-primary",
      score_version_id: "score-371-v2",
      role: "primary",
      position: 1,
      settings: {},
    }],
    score_versions: [{
      id: "score-371-v2",
      score_id: "hymn-371",
      version_number: 2,
      source_sha256: "a".repeat(64),
      document: make_document(status, published_at),
      created_at: published_at,
      published_at,
    }],
  };
}

function make_document(
  status: score_document_status,
  published_at: string,
): score_document_v2 {
  return {
    schema_version: 2,
    id: "hymn-371",
    number: "371",
    title: "数据库发布诗歌",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status,
    provenance: {
      kind: "pptx",
      source_id: "hymn-pptx-371",
      source_file: "371.pptx",
      source_sha256: "b".repeat(64),
      font_config_version: "font-v1",
      importer_version: "import-v1",
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures: [{
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "event-1",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ id: "note-1", midi: 60, source_refs: [] }],
        source_refs: [],
      }],
    }],
    review: {
      reviewed_by: "reviewer",
      reviewed_at: published_at,
      published_by: status === "published" ? "publisher" : null,
      published_at: status === "published" ? published_at : null,
      note: null,
    },
  };
}
