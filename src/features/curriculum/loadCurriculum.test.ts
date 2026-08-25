import { beforeEach, describe, expect, it, vi } from "vitest";

import type { score_document_v2 } from "@/features/score";

const { api_request_mock } = vi.hoisted(() => ({
  api_request_mock: vi.fn(),
}));

vi.mock("@/features/api/client", () => ({
  api_request: api_request_mock,
}));

import {
  build_curriculum_tree,
  clear_active_curriculum_cache,
  load_active_curriculum,
} from "./loadCurriculum";
import {
  published_curriculum_snapshot_key,
  save_published_curriculum_snapshot,
} from "./snapshot";
import type { active_curriculum, curriculum_node_record } from "./types";

beforeEach(() => {
  api_request_mock.mockReset();
  clear_active_curriculum_cache();
});

describe("数据库课程读取模型", () => {
  it("按 parent_id 和 position 构建课程树", () => {
    const nodes: curriculum_node_record[] = [
      node("lesson-a", "lesson", "课 A", 2, "day-1"),
      node("stage-1", "stage", "阶段", 1),
      node("day-1", "practice_day", "第一天", 1, "week-1"),
      node("week-1", "week", "第一周", 1, "stage-1"),
      node("lesson-b", "lesson", "课 B", 1, "day-1"),
    ];

    const tree = build_curriculum_tree(nodes);

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].children.map((item) => item.id))
      .toEqual(["lesson-b", "lesson-a"]);
  });
});

describe("load_active_curriculum", () => {
  it("严格验证在线发布课程并写入最后发布快照", async () => {
    const storage = create_storage();
    const curriculum = make_curriculum();
    api_request_mock.mockResolvedValue({ curriculum });

    const loaded = await load_active_curriculum({ storage });
    expect(loaded.nodes.map((item) => item.id)).toEqual(["lesson-1"]);
    expect(api_request_mock).toHaveBeenCalledWith(
      "/api/v1/curriculums/active",
    );
    expect(JSON.parse(
      storage.getItem(published_curriculum_snapshot_key) ?? "null",
    )).toEqual(loaded);
  });

  it("网络失败时读取最后一个有效发布快照", async () => {
    const storage = create_storage();
    const curriculum = make_curriculum();
    save_published_curriculum_snapshot(curriculum, storage);
    api_request_mock.mockRejectedValue(new Error("offline"));

    const loaded = await load_active_curriculum({ storage });
    const expected = JSON.parse(JSON.stringify({
      ...curriculum,
      nodes: curriculum.nodes.filter((item) => item.status === "active"),
    }));
    expect(loaded).toEqual(expected);
    expect(loaded.nodes.map((item) => item.id)).toEqual(["lesson-1"]);
  });

  it("无有效快照时继续抛出网络或发布校验错误", async () => {
    const storage = create_storage();
    api_request_mock.mockRejectedValueOnce(new Error("offline"));
    await expect(load_active_curriculum({ storage })).rejects.toThrow(
      "offline",
    );

    clear_active_curriculum_cache();
    const candidate = make_curriculum();
    candidate.score_versions[0].document.status = "candidate";
    api_request_mock.mockResolvedValueOnce({ curriculum: candidate });
    await expect(load_active_curriculum({ storage })).rejects.toThrow(
      /结构无效/u,
    );
    expect(storage.getItem(published_curriculum_snapshot_key)).toBeNull();
  });
});

function node(
  id: string,
  kind: curriculum_node_record["kind"],
  title: string,
  position: number,
  parent_id?: string,
): curriculum_node_record {
  return {
    id,
    revision_id: "rev-1",
    parent_id,
    kind,
    title,
    position,
    payload: {},
    status: "active",
    updated_at: "2026-07-22T00:00:00.000Z",
  };
}

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
    nodes: [
      node("lesson-1", "lesson", "诗歌练习", 1),
      { ...node("archived", "lesson", "旧课", 2), status: "archived" },
    ],
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
      document: {
        schema_version: 2,
        status: "published",
      } as score_document_v2,
      created_at: "2026-07-24T07:00:00.000Z",
      published_at: "2026-07-24T08:00:00.000Z",
    }],
  };
}

function create_storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
