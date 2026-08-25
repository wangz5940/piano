import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type {
  jianpu_catalog,
  jianpu_score,
} from "@/features/jianpu/types";

import {
  JianpuLibrary,
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
        page: 7,
        title: "右手触键练习",
        text: "每当一个手指触键时，其前一手指应立即抬起。",
        exercise_labels: [],
      }],
      chapters: [{
        id: "touch-exercises",
        title: "手指触键练习",
        description: "建立单手与双手触键的稳定动作。",
        page_start: 7,
        page_end: 9,
      }],
      segments: [{
        id: "beyer.segment.001",
        sequence: 1,
        title: "右手触键练习",
        source_pages: [7],
        source_page_label: "原谱第 7 页",
        page_slices: [{
          source_pages: [7],
          title: "右手触键练习",
          text: "每当一个手指触键时，其前一手指应立即抬起。",
          measure_start: 1,
          measure_end: 24,
          chapter_id: "touch-exercises",
          chapter_title: "手指触键练习",
          mapping: "verified",
        }],
        exercise_labels: [],
        jianpu_url: "/materials/jianpu/beyer/001.json",
        musicxml_url: "/materials/beyer/拜厄钢琴基本教程_乐章_001.musicxml",
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

describe("简谱教材", () => {
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

  it("按树状索引展示两本教材和单手谱入口", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/简谱教材/beyer/beyer.segment.001"]}>
        <Routes>
          <Route
            path="/简谱教材/:material_id/:segment_id"
            element={<JianpuLibrary initial_catalog={catalog_fixture} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("原教材文字与简谱练习");
    expect(markup).toContain("拜厄钢琴基本教程");
    expect(markup).toContain("哈农钢琴练指法");
    expect(markup).toContain("原谱第 7 页");
    expect(markup).toContain("阅读索引");
    expect(markup).toContain("收起阅读目录");
    expect(markup).toContain(">简谱<");
    expect(markup).toContain("右手谱");
    expect(markup).not.toContain("左手休止");
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
    expect(markup).toContain("双手谱");
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
    expect(markup).toContain("章节导读");
    expect(markup).toContain("本页内容");
    expect(markup).toContain("每当一个手指触键时");
    expect(markup).toContain("关联练习");
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
