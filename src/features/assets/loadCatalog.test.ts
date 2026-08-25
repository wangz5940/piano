import { describe, expect, it } from "vitest";

import { normalize_material_catalog } from "./loadCatalog";

describe("教材目录加载", () => {
  it("拒绝允许候选谱例判定的损坏清单", () => {
    expect(() => normalize_material_catalog({
      schema_version: "1.0",
      generated_at: "2026-07-18",
      review_only: true,
      notice: "review only",
      materials: [{
        id: "beyer",
        title: "拜厄钢琴基本教程",
        page_count: 102,
        segment_count: 1,
        segments: [{
          id: "beyer.segment.001",
          material_id: "beyer",
          sequence: 1,
          title: "拜厄 · 乐章 001",
          source_pages: [7],
          source_page_label: "PDF 第 7 页",
          ocr_labels: [],
          ocr_exercise_numbers: [],
          section: null,
          xml_version: "4.0.3",
          part_count: 1,
          measure_count: 1,
          time_signatures: ["4/4"],
          musicxml_url: "/materials/beyer/example.musicxml",
          sha256: "abc",
          source_status: "candidate",
          status: "needs_review",
          realtime_judgement_allowed: true,
          mapping_confidence: "source_page",
        }],
      }],
    })).toThrow("待核对谱例不能开启跟弹提示");
  });

  it("保留候选片段的源页和 MusicXML 地址", () => {
    const catalog = normalize_material_catalog({
      schema_version: "1.0",
      generated_at: "2026-07-18",
      review_only: true,
      notice: "review only",
      materials: [{
        id: "hanon",
        title: "哈农钢琴练指法",
        page_count: 119,
        segment_count: 1,
        segments: [{
          id: "hanon.segment.001",
          material_id: "hanon",
          sequence: 1,
          title: "哈农 · 乐章 001",
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
        }],
      }],
    });

    expect(catalog.materials[0].segments[0]).toMatchObject({
      source_pages: [6, 7],
      musicxml_url: "/materials/hanon/example.musicxml",
      fingering: {
        summary: expect.stringContaining("哈农第一部分"),
      },
    });
    expect(catalog.materials[0].segments[0].fingering?.rules.some((rule) =>
      rule.text.includes("重点训练的手指均用数字表示"))).toBe(true);
  });

  it("过滤已软删除的教材谱库片段并重算片段数", () => {
    const catalog = normalize_material_catalog({
      schema_version: "1.0",
      generated_at: "2026-07-18",
      review_only: true,
      notice: "review only",
      materials: [{
        id: "beyer",
        title: "拜厄钢琴基本教程",
        page_count: 102,
        segment_count: 2,
        segments: [
          create_segment("beyer.segment.001", "deleted"),
          create_segment("beyer.segment.002", "active"),
        ],
      }],
    });

    expect(catalog.materials[0].segment_count).toBe(1);
    expect(catalog.materials[0].segments.map((segment) => segment.id))
      .toEqual(["beyer.segment.002"]);
  });

  it("拒绝缺少同版本派生产物的已发布谱例", () => {
    expect(() => normalize_material_catalog({
      schema_version: "1.0",
      generated_at: "2026-07-18",
      review_only: false,
      notice: "published",
      materials: [{
        id: "beyer",
        title: "拜厄钢琴基本教程",
        page_count: 102,
        segment_count: 1,
        segments: [{
          id: "beyer.segment.001",
          material_id: "beyer",
          sequence: 1,
          title: "拜厄 · 乐章 001",
          source_pages: [7],
          source_page_label: "PDF 第 7 页",
          ocr_labels: [],
          ocr_exercise_numbers: [],
          section: null,
          xml_version: "4.0.3",
          part_count: 1,
          measure_count: 1,
          time_signatures: ["4/4"],
          musicxml_url: "/materials/beyer/example.musicxml",
          sha256: "abc",
          source_status: "candidate",
          status: "published",
          realtime_judgement_allowed: true,
          mapping_confidence: "source_page",
        }],
      }],
    })).toThrow("已发布谱例缺少同版本的派生产物");
  });

  it("保留 OCR 指法候选文件入口但不把它当作已确认指法", () => {
    const catalog = normalize_material_catalog({
      schema_version: "1.0",
      generated_at: "2026-07-22",
      review_only: true,
      notice: "review only",
      materials: [{
        id: "john-thompson-easiest-1",
        title: "约翰·汤普森简易钢琴教程 1",
        page_count: 45,
        segment_count: 1,
        segments: [{
          id: "john-thompson-easiest-1.segment.001",
          material_id: "john-thompson-easiest-1",
          sequence: 1,
          title: "小汤 1 · 乐章 001",
          source_pages: [11, 12],
          source_page_label: "PDF 第 11、12 页",
          ocr_labels: [],
          ocr_exercise_numbers: [],
          section: null,
          xml_version: "4.0.3",
          part_count: 1,
          measure_count: 8,
          time_signatures: ["4/4"],
          musicxml_url: "/materials/john-thompson-easiest-1/example.musicxml",
          sha256: "abc",
          source_status: "candidate",
          status: "needs_review",
          realtime_judgement_allowed: false,
          mapping_confidence: "source_page",
          fingering_candidates_url:
            "/materials/john-thompson-easiest-1/example.fingering.json",
        }],
      }],
    });

    expect(catalog.materials[0].segments[0]).toMatchObject({
      fingering_candidates_url: "/materials/john-thompson-easiest-1/example.fingering.json",
      fingering: {
        summary: expect.stringContaining("OCR 指法候选"),
        limitation: expect.stringContaining("不是已确认的逐音指法"),
      },
    });
  });
});

function create_segment(
  id: string,
  deletion_status: "active" | "deleted",
) {
  return {
    id,
    material_id: "beyer",
    deletion_status,
    sequence: 1,
    title: "拜厄 · 乐章",
    source_pages: [7],
    source_page_label: "PDF 第 7 页",
    ocr_labels: [],
    ocr_exercise_numbers: [],
    section: null,
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
  };
}
