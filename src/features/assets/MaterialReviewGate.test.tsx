import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MaterialReviewGate } from "./MaterialReviewGate";
import type { material_segment } from "./types";

const needs_review_segment: material_segment = {
  id: "hanon.segment.001",
  material_id: "hanon",
  sequence: 1,
  title: "哈农钢琴练指法 · 乐章 001",
  source_pages: [6, 7],
  source_page_label: "PDF 第 6、7 页",
  ocr_labels: ["练习一"],
  ocr_exercise_numbers: [1],
  xml_version: "4.0.3",
  part_count: 1,
  measure_count: 29,
  time_signatures: ["2/4"],
  musicxml_url: "/materials/hanon/example.musicxml",
  sha256: "content-hash",
  source_status: "candidate",
  status: "needs_review",
  realtime_judgement_allowed: false,
  mapping_confidence: "source_page",
};

describe("教材审核门禁组件", () => {
  it("展示审核证据、状态按钮和发布阻断原因", () => {
    const markup = renderToStaticMarkup(
      <MaterialReviewGate
        segment={needs_review_segment}
        review_record={undefined}
        on_transition={() => undefined}
        on_reset={() => undefined}
      />,
    );

    expect(markup).toContain("审核门禁");
    expect(markup).toContain("结构与时值校验");
    expect(markup).toContain("音乐语义核对");
    expect(markup).toContain("原谱视觉核对");
    expect(markup).toContain("标记为已核对");
    expect(markup).toContain("发布当前版本");
    expect(markup).toContain("缺少本次练习所需的跟弹提示");
  });
});
