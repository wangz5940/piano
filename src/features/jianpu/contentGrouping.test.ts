import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { group_material_by_content } from "./contentGrouping";
import { combine_work_scores } from "./workScore";
import type { jianpu_catalog, jianpu_score } from "./types";

const catalog: jianpu_catalog = JSON.parse(readFileSync(
  resolve("public/materials/jianpu-catalog.json"), "utf8",
));

describe("按完整乐曲组织教材", () => {
  it.each(catalog.materials)("保留 $id 的每个源小节且不重复", (material) => {
    const grouped = group_material_by_content(material);
    const counts = new Map<string, number[]>();
    for (const work of grouped.segments) {
      for (const source of work.sources!) {
        const measures = counts.get(source.segment_id) ?? [];
        for (let index = source.measure_start; index <= source.measure_end; index++) measures.push(index);
        counts.set(source.segment_id, measures);
      }
    }
    for (const segment of material.segments) {
      expect(counts.get(segment.id)).toEqual(Array.from({ length: segment.measure_count }, (_, i) => i + 1));
    }
    expect(grouped.source_segments).toBe(material.segments);
  });

  it.each([
    ["上山坡", 8], ["滑稽面孔", 16], ["军号响", 16],
    ["划小船", 16], ["乘黄包车", 8],
  ])("跨文件的%s只出现一次并包含全部%d小节", (title, count) => {
    const grouped = group_material_by_content(catalog.materials.find((m) => m.id === "john-thompson-easiest-1")!);
    const works = grouped.segments.filter((item) => item.title === title);
    expect(works).toHaveLength(1);
    expect(works[0].measure_count).toBe(count);
    expect(works[0].sources).toHaveLength(2);
    const scores = works[0].sources!.map((source): jianpu_score =>
      JSON.parse(readFileSync(resolve("public", source.jianpu_url.slice(1)), "utf8")));
    const merged = combine_work_scores(works[0], scores);
    expect(merged.measures).toHaveLength(count);
    expect(merged.measures.flatMap((measure) => measure.events)).toEqual(
      works[0].sources!.flatMap((source, i) =>
        scores[i].measures.slice(source.measure_start - 1, source.measure_end)
          .flatMap((measure) => measure.events)),
    );
  });

  it("同页练习分别列出，跨页三只瞎老鼠合为一曲", () => {
    const grouped = group_material_by_content(catalog.materials.find((m) => m.id === "john-thompson-easiest-2")!);
    const titles = grouped.segments.map((item) => item.title);
    for (const title of ["上学的日子", "捉人游戏", "穿过森林", "长号手", "三只瞎老鼠", "在跳舞的小袋鼠"]) {
      expect(titles.filter((item) => item === title)).toHaveLength(1);
    }
    expect(titles.some((title) => title.includes(" · "))).toBe(false);
    const page19 = grouped.segments.filter((work) => work.source_pages.includes(19));
    expect(page19.map((work) => work.title)).toEqual(["手指操练习（右手）", "手指操练习（左手）", "在跳舞的小袋鼠"]);
  });
});
