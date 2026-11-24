import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type {
  jianpu_catalog,
  jianpu_score,
} from "@/features/jianpu/types";
import { get_reading_material, get_reading_score_number } from "@/features/jianpu/readingCatalog";
import { group_material_by_content } from "@/features/jianpu/contentGrouping";
import { combine_work_scores } from "@/features/jianpu/workScore";

import {
  JianpuLibrary,
  JianpuPageSliceReader,
  TextbookJianpuScore,
} from "./JianpuLibrary";

const catalog_fixture: jianpu_catalog = {
  schema_version: "1.0",
  generated_at: "2026-07-19",
  materials: [
    {
      id: "beyer",
      title: "拜厄钢琴基本教程",
      description: "从读谱、触键到双手配合的基础教材。",
      page_count: 102,
      pages: [{
        page: 24,
        title: "练习13（双手练习）",
        text: "每当一个手指触键时，其前一手指应立即抬起。",
        exercise_labels: [],
      }],
      chapters: [{
        id: "touch-exercises",
        title: "手指触键练习",
        description: "建立单手与双手触键的稳定动作。",
        page_start: 24,
        page_end: 26,
      }],
      segments: [{
        id: "beyer.segment.031",
        sequence: 13,
        title: "练习13（双手练习）",
        source_pages: [24],
        source_page_label: "原谱第 24 页",
        page_slices: [{
          source_pages: [24],
          title: "练习13（双手练习）",
          text: "每当一个手指触键时，其前一手指应立即抬起。",
          measure_start: 1,
          measure_end: 24,
          chapter_id: "touch-exercises",
          chapter_title: "手指触键练习",
          mapping: "verified",
        }],
        exercise_labels: [],
        jianpu_url: "/materials/jianpu/beyer/031.json",
        musicxml_url: "/materials/beyer/拜厄钢琴基本教程_乐章_031.musicxml",
        measure_count: 24,
        time_signature: "4/4",
        key_signature: "C 大调（1 = C）",
        tonic_midi: 60,
        hand_mode: "right",
        has_left_hand: false,
        chord_count: 0,
      }],
    },
    {
      id: "hanon",
      title: "哈农钢琴练指法",
      description: "以手指独立、均匀触键与双手同步为核心的技术练习。",
      page_count: 119,
      pages: [{
        page: 6,
        title: "练习一",
        text: "高高地并正确地抬起手指，每个音符都要弹得很清晰。",
        exercise_labels: ["练习一"],
        section_title: "第一部分：准备练习",
      }],
      chapters: [{
        id: "part-one",
        title: "第一部分：准备练习",
        description: "建立手指独立、均匀与基本伸张能力。",
        page_start: 6,
        page_end: 25,
      }],
      segments: [{
        id: "hanon.segment.001",
        sequence: 1,
        title: "练习一",
        source_pages: [6],
        source_page_label: "原谱第 6 页",
        page_slices: [{
          source_pages: [6],
          title: "练习一",
          text: "高高地并正确地抬起手指，每个音符都要弹得很清晰。",
          measure_start: 1,
          measure_end: 29,
          chapter_id: "part-one",
          chapter_title: "第一部分：准备练习",
          mapping: "verified",
        }],
        exercise_labels: ["练习一"],
        section_title: "第一部分：准备练习",
        jianpu_url: "/materials/jianpu/hanon/001.json",
        musicxml_url: "/materials/hanon/哈农钢琴练指法_乐章_001.musicxml",
        measure_count: 29,
        time_signature: "2/4",
        key_signature: "C 大调（1 = C）",
        tonic_midi: 60,
        hand_mode: "both",
        has_left_hand: true,
        chord_count: 0,
      }],
    },
  ],
};

const admin = {
  id: "admin-jianpu",
  email: "admin@example.com",
  display_name: "管理员",
  role: "admin" as const,
  status: "active" as const,
  created_at: "2026-08-24T00:00:00.000Z",
  updated_at: "2026-08-24T00:00:00.000Z",
};

describe("简谱教材", () => {
  it("按学习顺序展示教材，并默认直接打开小汤 1 的 001 曲谱", () => {
    const catalog: jianpu_catalog = JSON.parse(readFileSync(resolve("public/materials/jianpu-catalog.json"), "utf8"));

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材"]}>
        <Routes>
          <Route
            path="/简谱教材"
            element={<JianpuLibrary initial_catalog={catalog} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const small_thompson_1 = markup.indexOf('<option value="john-thompson-easiest-1"');
    const small_thompson_2 = markup.indexOf('<option value="john-thompson-easiest-2"');
    const beyer_index = markup.indexOf('<option value="beyer"');
    const hanon_index = markup.indexOf('<option value="hanon"');

    expect(small_thompson_1).toBeGreaterThan(-1);
    expect(small_thompson_1).toBeLessThan(small_thompson_2);
    expect(small_thompson_2).toBeLessThan(beyer_index);
    expect(beyer_index).toBeLessThan(hanon_index);
    expect(markup).toMatch(/<option value="john-thompson-easiest-1"[^>]*selected=""/);
    expect(markup).toContain('aria-label="教材选择"');
    expect(markup.indexOf('class="textbook-material-picker"'))
      .toBeLessThan(markup.indexOf('class="textbook-catalog-trigger"'));
    expect(markup).not.toContain("jianpu-material-tabs");
    expect(markup).toContain('class="textbook-score-number">001</span>请弹吧（右手）');
    expect(markup).toContain('--score-zoom:0.72');
    expect(markup).not.toContain("章节导读");
    expect(markup).not.toContain("jianpu-segment-panel");
  });

  it("拜厄从第 24 页练习 13 开始，同时保留共用源谱中的准确小节范围", () => {
    const catalog: jianpu_catalog = JSON.parse(readFileSync(resolve("public/materials/jianpu-catalog.json"), "utf8"));
    const source = catalog.materials.find((item) => item.id === "beyer")!;
    const reading = get_reading_material(source);
    const first = reading.segments[0];
    expect(first.title).toBe("练习13（双手练习）");
    expect(first.source_pages).toEqual([24]);
    expect(get_reading_score_number(reading, first)).toBe("013");
    expect(reading.segments.slice(0, 4).map((item) => get_reading_score_number(reading, item)))
      .toEqual(["013", "014", "015", "016"]);
    expect(first.sources).toEqual([expect.objectContaining({ segment_id: "beyer.segment.031", measure_start: 25, measure_end: 32 })]);
    expect(reading.segments.every((item) => item.source_pages.every((page) => page >= 24))).toBe(true);
    expect(reading.pages[0].page).toBe(24);
    expect(reading.chapters[0].page_start).toBe(24);
    const source_score: jianpu_score = JSON.parse(readFileSync(resolve("public/materials/jianpu/beyer/031.json"), "utf8"));
    const score = combine_work_scores(first, [source_score]);
    expect(score.measures).toHaveLength(8);
    expect(score.measures.flatMap((measure) => measure.events))
      .toEqual(source_score.measures.slice(24, 32).flatMap((measure) => measure.events));
    for (const material of catalog.materials.filter((item) => item.id !== "beyer")) {
      expect(get_reading_material(material)).toEqual(group_material_by_content(material));
    }
  });

  it("教材谱面使用统一 SVG 并且不把单手空位画成休止", () => {
    const score: jianpu_score = {
      schema_version: "1.0",
      segment_id: "textbook-render-test",
      key_signature: "C 大调（1 = C）",
      tonic_midi: 60,
      time_signature: "2/4",
      measures: [{
        index: 1,
        number: "1",
        directions: ["轻轻落键"],
        events: [{
          onset_beats: 0.5,
          duration_beats: 0.5,
          right_notes: [61],
          left_notes: [],
          chord: "C",
        }],
      }],
    };

    const markup = renderToStaticMarkup(<TextbookJianpuScore score={score} />);

    expect(markup).toContain("textbook-jianpu-renderer");
    expect(markup).toContain('data-jianpu-system="0"');
    expect(markup).toContain('data-onset="0.5"');
    expect(markup).toContain('data-jianpu-accidental="#"');
    expect(markup).not.toContain('data-hand="left"');
    expect(markup).not.toContain("jianpu-svg-rest");

    const intermediate_markup = renderToStaticMarkup(
      <TextbookJianpuScore score={score} show_final_bar={false} />,
    );
    expect(intermediate_markup).not.toContain("jianpu-svg-barline is-final");
  });

  it("曲目标题只在首段谱面内展示，章节阅读保留学习提示", () => {
    const source_segment = catalog_fixture.materials[0].segments[0];
    const score: jianpu_score = {
      schema_version: "1.0",
      segment_id: source_segment.id,
      key_signature: source_segment.key_signature,
      tonic_midi: source_segment.tonic_midi,
      time_signature: source_segment.time_signature,
      measures: Array.from({ length: source_segment.measure_count }, (_, index) => ({
        index: index + 1,
        number: String(index + 1),
        directions: [],
        events: [],
      })),
    };
    const markup = renderToStaticMarkup(
      <JianpuPageSliceReader score={score} page_slices={source_segment.page_slices} />,
    );

    expect(markup).not.toContain("jianpu-chapter-heading");
    expect(markup).not.toContain("jianpu-page-card-head");
    expect(markup).not.toContain("教材章节");
    expect(markup).toContain("学习提示");
    expect(markup).toContain("textbook-score-slice");
    expect(markup).not.toContain("score-page-title");

    const titled_markup = renderToStaticMarkup(
      <JianpuPageSliceReader score={score}
        page_slices={[
          { ...source_segment.page_slices[0], measure_end: 12 },
          { ...source_segment.page_slices[0], measure_start: 13 },
        ]}
        score_title="013 练习13（双手练习）"
        zoom_control={{ zoom: 0.72, set_zoom: () => {} }} />,
    );
    expect(titled_markup.match(/class="score-page-title"/g)).toHaveLength(1);
    expect(titled_markup).toContain('class="score-zoom-content"><h2 class="score-page-title">013 练习13（双手练习）</h2>');
    expect(titled_markup.match(/--score-zoom:0.72/g)).toHaveLength(2);
  });

  it("提供全屏、悬浮目录和切曲入口，并保留单手谱与收藏功能", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材/beyer/beyer.segment.031"]}>
        <Routes>
          <Route
            path="/简谱教材/:material_id/:segment_id"
            element={<JianpuLibrary initial_catalog={catalog_fixture} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("拜厄钢琴基本教程");
    expect(markup).toContain("哈农钢琴练指法");
    expect(markup).toContain("原谱第 24 页");
    expect(markup).toContain('aria-label="退出全屏"');
    expect(markup).toContain('class="textbook-score-stage is-fullscreen"');
    expect(markup).toContain('class="score-zoom-content"><h2 class="score-page-title">');
    expect(markup).toContain('aria-label="曲谱目录"');
    expect(markup).toContain('aria-label="收藏练习13（双手练习）"');
    expect(markup).not.toContain("阅读索引");
    expect(markup).toContain(">简谱<");
    expect(markup).toContain("右手材料");
    expect(markup).toContain("上一首");
    expect(markup).toContain("下一首");
    expect(markup).toContain("已经是第一首");
    expect(markup).toContain("已经是最后一首");
    expect(markup).toContain('class="textbook-stage-navigation" hidden=""');
    expect(markup).not.toContain("校对乐谱");
    expect(markup).not.toContain("左手休止");
  });

  it("管理员可从简谱曲谱直接进入对应校准台", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材/beyer/beyer.segment.031"]}>
        <Routes>
          <Route
            path="/简谱教材/:material_id/:segment_id"
            element={<JianpuLibrary initial_catalog={catalog_fixture} user_override={admin} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("校对乐谱");
    expect(markup).toContain('href="/校准?segment=beyer%3Abeyer.segment.031"');
  });

  it("按索引打开哈农片段时保留章节和双手信息", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材/hanon/hanon.segment.001"]}>
        <Routes>
          <Route
            path="/简谱教材/:material_id/:segment_id"
            element={<JianpuLibrary initial_catalog={catalog_fixture} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("练习一");
    expect(markup).toContain("第一部分：准备练习");
    expect(markup).toContain("右手与左手");
  });

  it("为教材章节提供原页文字导读和关联练习入口", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材/beyer/章节/touch-exercises"]}>
        <Routes>
          <Route
            path="/简谱教材/:material_id/章节/:chapter_id"
            element={<JianpuLibrary initial_catalog={catalog_fixture} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("教材章节");
    expect(markup).toContain("手指触键练习");
    expect(markup).toContain("章节学习提示");
    expect(markup).toContain("每当一个手指触键时");
    expect(markup).toContain("乐曲目录");
  });

  it("对无效教材路由显示明确的未找到状态", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材/unknown/unknown.segment"]}>
        <Routes>
          <Route
            path="/简谱教材/:material_id/:segment_id"
            element={<JianpuLibrary initial_catalog={catalog_fixture} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("未找到指定教材");
    expect(markup).toContain("重新选择");
  });
});
