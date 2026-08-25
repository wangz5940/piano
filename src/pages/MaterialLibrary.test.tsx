import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { material_catalog } from "@/features/assets/types";
import { apply_material_fingering_annotations } from "@/features/assets/fingeringAnnotations";

import { MaterialLibrary } from "./MaterialLibrary";

const catalog_fixture: material_catalog = {
  schema_version: "1.0",
  generated_at: "2026-07-18",
  review_only: true,
  notice: "Candidate MusicXML is for source comparison only and must not drive realtime judgement.",
  materials: [
    {
      id: "beyer",
      title: "拜厄钢琴基本教程",
      page_count: 102,
      segment_count: 1,
      segments: [
        {
          id: "beyer.segment.001",
          material_id: "beyer",
          sequence: 1,
          title: "拜厄钢琴基本教程 · 乐章 001",
          source_pages: [7],
          source_page_label: "PDF 第 7 页",
          ocr_labels: [],
          ocr_exercise_numbers: [],
          xml_version: "4.0.3",
          part_count: 1,
          measure_count: 1,
          time_signatures: ["4/4"],
          musicxml_url: "/materials/beyer/example.musicxml",
          sha256: "abc",
          source_status: "candidate",
          status: "needs_review",
          realtime_judgement_allowed: false,
          mapping_confidence: "source_page",
        },
      ],
    },
    {
      id: "hanon",
      title: "哈农钢琴练指法",
      page_count: 119,
      segment_count: 1,
      segments: [
        {
          id: "hanon.segment.001",
          material_id: "hanon",
          sequence: 1,
          title: "哈农钢琴练指法 · 乐章 001",
          source_pages: [6, 7],
          source_page_label: "PDF 第 6、7 页",
          ocr_labels: ["练习一"],
          ocr_exercise_numbers: [1],
          section: { id: "part_1", title: "第一部分：准备练习" },
          xml_version: "4.0.3",
          part_count: 1,
          measure_count: 29,
          time_signatures: ["2/4"],
          musicxml_url: "/materials/hanon/example.musicxml",
          sha256: "abc",
          source_status: "candidate",
          status: "needs_review",
          realtime_judgement_allowed: false,
          mapping_confidence: "source_page",
        },
      ],
    },
  ],
};

describe("教材谱库", () => {
  it("显示两套教材和候选谱例的人工核对提示", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/教材/hanon/hanon.segment.001"]}>
        <Routes>
          <Route
            path="/教材/:material_id/:segment_id"
            element={<MaterialLibrary initial_catalog={apply_material_fingering_annotations(catalog_fixture)} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain("教材谱库");
    expect(markup).toContain("拜厄钢琴基本教程");
    expect(markup).toContain("哈农钢琴练指法");
    expect(markup).toContain("仅供核对");
    expect(markup).toContain("原谱第 6、7 页");
    expect(markup).toContain("识别标签：练习 1");
    expect(markup).not.toContain("原谱指法说明");
    expect(markup).not.toContain("重点训练的手指均用数字表示");
    expect(markup).not.toContain("逐音指法谱");
    expect(markup).not.toContain("审核门禁");
    expect(markup).not.toContain("发布当前版本");
  });

  it("空教材目录展示可恢复的产品空态", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/教材"]}>
        <MaterialLibrary
          initial_catalog={{
            ...catalog_fixture,
            materials: [],
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("教材内容正在整理");
    expect(markup).toContain("原创练习仍可正常使用");
  });
});
