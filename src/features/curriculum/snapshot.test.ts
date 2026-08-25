import { describe, expect, it } from "vitest";

import type { score_document_v2 } from "@/features/score";

import {
  load_published_curriculum_snapshot,
  published_curriculum_snapshot_key,
  save_published_curriculum_snapshot,
} from "./snapshot";
import type { active_curriculum } from "./types";

describe("published curriculum snapshot", () => {
  it("只保存并读取绑定已发布 ScoreDocument 的课程", () => {
    const storage = create_storage();
    const curriculum = make_curriculum();

    save_published_curriculum_snapshot(curriculum, storage);

    expect(load_published_curriculum_snapshot(storage)).toEqual(curriculum);
    expect(storage.getItem(published_curriculum_snapshot_key)).toBeTruthy();
  });

  it.each([
    ["draft revision", (value: active_curriculum) => {
      value.revision.status = "draft";
    }],
    ["candidate document", (value: active_curriculum) => {
      value.score_versions[0].document.status = "needs_review";
    }],
    ["missing version timestamp", (value: active_curriculum) => {
      value.score_versions[0].published_at = "";
    }],
    ["unknown binding version", (value: active_curriculum) => {
      value.lesson_score_bindings[0].score_version_id = "missing-version";
    }],
  ])("拒绝无效发布快照：%s", (_, mutate) => {
    const storage = create_storage();
    const curriculum = make_curriculum();
    mutate(curriculum);

    expect(() =>
      save_published_curriculum_snapshot(curriculum, storage)
    ).toThrow();
    expect(storage.getItem(published_curriculum_snapshot_key)).toBeNull();
  });

  it("离线缓存损坏或含候选版本时返回空并清理缓存", () => {
    const malformed = create_storage();
    malformed.setItem(published_curriculum_snapshot_key, "{bad-json");
    expect(load_published_curriculum_snapshot(malformed)).toBeUndefined();
    expect(malformed.getItem(published_curriculum_snapshot_key)).toBeNull();

    const candidate = make_curriculum();
    candidate.score_versions[0].document.status = "candidate";
    const invalid = create_storage();
    invalid.setItem(
      published_curriculum_snapshot_key,
      JSON.stringify(candidate),
    );
    expect(load_published_curriculum_snapshot(invalid)).toBeUndefined();
    expect(invalid.getItem(published_curriculum_snapshot_key)).toBeNull();
  });
});

function make_curriculum(): active_curriculum {
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
      description: "绑定已发布诗歌。",
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
    lesson_score_bindings: [{
      id: "binding-1",
      lesson_node_id: "lesson-1",
      score_version_id: "score-371-v1",
      role: "primary",
      position: 1,
      settings: {},
    }],
    score_versions: [{
      id: "score-371-v1",
      score_id: "hymn-371",
      version_number: 1,
      source_sha256: "a".repeat(64),
      document: make_score_document(),
      created_at: "2026-07-24T07:00:00.000Z",
      published_at: "2026-07-24T08:00:00.000Z",
    }],
  };
}

function make_score_document(): score_document_v2 {
  return {
    schema_version: 2,
    id: "hymn-371",
    number: "371",
    title: "耶稣爱我",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status: "published",
    provenance: {
      kind: "pptx",
      source_id: "hymn-pptx-371",
      source_file: "371 耶稣爱我.pptx",
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
      reviewed_at: "2026-07-24T07:00:00.000Z",
      published_by: "publisher",
      published_at: "2026-07-24T08:00:00.000Z",
      note: null,
    },
  };
}

function create_storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
