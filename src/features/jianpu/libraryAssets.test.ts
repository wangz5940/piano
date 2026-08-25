import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface asset_page {
  page: number;
  text: string;
}

interface asset_segment {
  id: string;
  source_pages: number[];
  page_slices: Array<{
    source_pages: number[];
    title: string;
    text: string;
    measure_start: number;
    measure_end: number;
    chapter_id: string;
    chapter_title: string;
    mapping: "verified" | "cross_page";
  }>;
  jianpu_url: string;
  measure_count: number;
  hand_mode: "right" | "left" | "both";
  has_left_hand: boolean;
  chord_count: number;
}

interface asset_material {
  id: string;
  page_count: number;
  pages: asset_page[];
  chapters: Array<{
    id: string;
    title: string;
    description: string;
    page_start: number;
    page_end: number;
  }>;
  segments: asset_segment[];
}

interface asset_catalog {
  materials: asset_material[];
}

interface asset_score {
  segment_id: string;
  measures: Array<{
    events: Array<{
      right_notes: number[];
      left_notes: number[];
      chord?: string;
    }>;
  }>;
}

function read_json<T>(relative_path: string): T {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), relative_path), "utf8"),
  ) as T;
}

describe("简谱教材资源", () => {
  it("完整索引两本教材的原页文字和片段", () => {
    const catalog = read_json<asset_catalog>("public/materials/jianpu-catalog.json");
    const materials = new Map(catalog.materials.map((material) => [material.id, material]));
    const beyer = materials.get("beyer");
    const hanon = materials.get("hanon");

    expect(materials.size).toBe(4);
    expect(beyer?.pages).toHaveLength(102);
    expect(hanon?.pages).toHaveLength(119);
    expect(materials.get("john-thompson-easiest-1")?.pages).toHaveLength(45);
    expect(materials.get("john-thompson-easiest-2")?.pages).toHaveLength(52);
    expect(beyer?.chapters[0]).toMatchObject({
      id: "front-matter",
      title: "封面与目录",
      page_start: 1,
      page_end: 2,
    });
    expect(beyer?.chapters[1]).toMatchObject({
      id: "music-literacy",
      title: "音乐入门知识",
      page_start: 3,
      page_end: 6,
    });
    expect(beyer?.chapters.map((chapter) => chapter.title)).toContain("手指触键练习");
    expect(beyer?.chapters.map((chapter) => chapter.title)).toContain("附录：手指练习");
    expect(beyer?.segments.length).toBeGreaterThan(0);
    expect(hanon?.segments.length).toBeGreaterThan(0);
    expect(beyer?.pages.find((page) => page.page === 7)?.text).toContain("每当一个手指触键时");
    expect(beyer?.pages.find((page) => page.page === 11)?.text).toContain("legato");
    expect(hanon?.pages.find((page) => page.page === 5)?.text).toContain("60首《钢琴练指法》");
    expect(hanon?.pages.find((page) => page.page === 6)?.text).toContain("节拍器");
    expect(materials.get("john-thompson-easiest-1")?.pages.find((page) => page.page === 12)?.text)
      .toContain("全音符的中央C");
    expect(materials.get("john-thompson-easiest-2")?.pages.find((page) => page.page === 7)?.text)
      .toContain("八分音符");
  });

  it("所有索引片段都有可读的简谱、双手元数据与和弦信息", () => {
    const catalog = read_json<asset_catalog>("public/materials/jianpu-catalog.json");
    const left_hand_beyer_segments = new Set([
      "beyer.segment.008",
      "beyer.segment.009",
      "beyer.segment.010",
      "beyer.segment.011",
      "beyer.segment.012",
      "beyer.segment.017",
      "beyer.segment.018",
      "beyer.segment.019",
      "beyer.segment.136",
    ]);
    let total_chord_event_count = 0;

    for (const material of catalog.materials) {
      const known_pages = new Set(material.pages.map((page) => page.page));
      const known_chapters = new Set(material.chapters.map((chapter) => chapter.id));

      expect(material.pages.map((page) => page.page)).toEqual(
        Array.from({ length: material.page_count }, (_, index) => index + 1),
      );
      expect(material.chapters.flatMap((chapter) =>
        Array.from(
          { length: chapter.page_end - chapter.page_start + 1 },
          (_, index) => chapter.page_start + index,
        ),
      )).toEqual(Array.from({ length: material.page_count }, (_, index) => index + 1));

      for (const segment of material.segments) {
        expect(segment.source_pages.every((page) => known_pages.has(page))).toBe(true);

        const relative_score_path = `public${segment.jianpu_url}`;
        expect(existsSync(resolve(process.cwd(), relative_score_path))).toBe(true);

        const score = read_json<asset_score>(relative_score_path);
        const has_left_hand = score.measures.some((measure) =>
          measure.events.some((event) => event.left_notes.length > 0));
        const has_right_hand = score.measures.some((measure) =>
          measure.events.some((event) => event.right_notes.length > 0));
        const score_chord_count = score.measures.reduce(
          (total, measure) => total + measure.events.filter((event) => event.chord).length,
          0,
        );

        expect(score.segment_id).toBe(segment.id);
        expect(score.measures).toHaveLength(segment.measure_count);
        expect(segment.page_slices.flatMap((slice) => slice.source_pages)).toEqual(segment.source_pages);
        expect(segment.page_slices[0]?.measure_start).toBe(1);
        expect(segment.page_slices.at(-1)?.measure_end).toBe(segment.measure_count);
        expect(segment.page_slices.every((slice, index) =>
          slice.title.length > 0 &&
          slice.text.length > 0 &&
          known_chapters.has(slice.chapter_id) &&
          slice.chapter_title.length > 0 &&
          (slice.mapping === "verified" || slice.mapping === "cross_page") &&
          slice.measure_start <= slice.measure_end &&
          (index === 0 || slice.measure_start === segment.page_slices[index - 1].measure_end + 1),
        )).toBe(true);
        if (segment.page_slices.some((slice) => slice.mapping === "cross_page")) {
          expect(segment.page_slices).toHaveLength(1);
        } else {
          expect(segment.page_slices.every((slice) => slice.source_pages.length === 1)).toBe(true);
        }
        expect(has_right_hand || has_left_hand).toBe(true);
        expect(has_left_hand).toBe(segment.has_left_hand);
        expect(segment.hand_mode).toBe(
          has_right_hand && has_left_hand ? "both" : has_right_hand ? "right" : "left",
        );
        if (left_hand_beyer_segments.has(segment.id)) {
          expect(segment.hand_mode).toBe("left");
        }
        expect(score_chord_count).toBe(segment.chord_count);

        total_chord_event_count += score_chord_count;
      }
    }

    expect(total_chord_event_count).toBeGreaterThan(0);
  });

  it("按原谱目录保留拜厄触键与三手练习的可靠页内范围", () => {
    const catalog = read_json<asset_catalog>("public/materials/jianpu-catalog.json");
    const beyer = catalog.materials.find((material) => material.id === "beyer");
    const first_segment = beyer?.segments.find((segment) => segment.id === "beyer.segment.001");

    expect(first_segment?.page_slices.map((slice) => [
      slice.source_pages,
      slice.measure_start,
      slice.measure_end,
      slice.chapter_id,
    ])).toEqual([
      [[7], 1, 64, "touch-exercises"],
      [[8], 65, 128, "touch-exercises"],
      [[9], 129, 189, "touch-exercises"],
      [[10], 190, 245, "three-hand-right"],
      [[11], 246, 301, "three-hand-right"],
      [[12], 302, 341, "three-hand-right"],
    ]);
  });
});
