import { describe, expect, it } from "vitest";

import {
  load_repertoire_favorite_ids,
  remove_score_favorite,
  toggle_score_favorite,
  toggle_repertoire_favorite,
} from "./favorites";

describe("热门曲目收藏", () => {
  it("可以添加和取消收藏，并去重", () => {
    expect(toggle_repertoire_favorite([], "ode-to-joy")).toEqual(["ode-to-joy"]);
    expect(toggle_repertoire_favorite(["ode-to-joy"], "ode-to-joy")).toEqual([]);
    expect(toggle_repertoire_favorite(["ode-to-joy", "twinkle-twinkle"], "ode-to-joy"))
      .toEqual(["twinkle-twinkle"]);
  });

  it("在服务端渲染时返回空收藏", () => {
    expect(load_repertoire_favorite_ids()).toEqual([]);
  });

  it("统一收藏记录支持添加、更新和删除任意曲谱", () => {
    const first = toggle_score_favorite([], {
      id: "material:beyer:beyer.segment.047",
      kind: "material",
      title: "片段 047",
      subtitle: "拜厄 · 原谱第 29 页",
      href: "/教材/beyer/beyer.segment.047",
      source: "教材谱库",
      updated_at: "2026-08-25T00:00:00.000Z",
    });
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe("片段 047");

    const updated = toggle_score_favorite(first, {
      id: "material:beyer:beyer.segment.047",
      kind: "material",
      title: "片段 047",
      subtitle: "拜厄 · 原谱第 29 页",
      href: "/教材/beyer/beyer.segment.047",
      source: "教材谱库",
      updated_at: "2026-08-25T00:00:00.000Z",
    });
    expect(updated).toEqual([]);

    expect(remove_score_favorite(first, "missing")).toEqual(first);
    expect(remove_score_favorite(first, "material:beyer:beyer.segment.047"))
      .toEqual([]);
  });
});
