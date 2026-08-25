import { describe, expect, it } from "vitest";

import type { material_review_checklist, material_segment } from "./types";
import {
  apply_material_review_record,
  create_initial_material_review_records,
  transition_material_review,
} from "./reviewGate";

const segment: material_segment = {
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

const complete_checklist: material_review_checklist = {
  structure_checked: true,
  music_semantics_checked: true,
  visual_pdf_checked: true,
  source_mapping_checked: true,
};

describe("教材审核门禁记录", () => {
  it("将完整审核证据与状态绑定到当前 MusicXML 哈希", () => {
    const record = transition_material_review(
      segment,
      undefined,
      "verified",
      complete_checklist,
      "已与 PDF 逐页核对。",
      "2026-07-18T12:00:00.000Z",
    );

    expect(record).toMatchObject({
      segment_id: "hanon.segment.001",
      content_sha256: "content-hash",
      status: "verified",
      checks: complete_checklist,
      note: "已与 PDF 逐页核对。",
    });
    expect(record.history).toEqual([{
      from_status: "needs_review",
      to_status: "verified",
      changed_at: "2026-07-18T12:00:00.000Z",
      note: "已与 PDF 逐页核对。",
    }]);
  });

  it("只把同一哈希的本地审核记录覆盖到当前目录", () => {
    const record = transition_material_review(
      segment,
      undefined,
      "verified",
      complete_checklist,
      "已与 PDF 逐页核对。",
      "2026-07-18T12:00:00.000Z",
    );

    expect(apply_material_review_record(segment, record).status).toBe("verified");
    expect(apply_material_review_record({ ...segment, sha256: "new-content-hash" }, record).status)
      .toBe("needs_review");
  });

  it("为首次使用创建空的本地审核记录集合", () => {
    expect(create_initial_material_review_records()).toEqual({
      schema_version: 1,
      records: {},
    });
  });

  it("没有同哈希的派生产物时不能从已验证发布", () => {
    const verified_record = transition_material_review(
      segment,
      undefined,
      "verified",
      complete_checklist,
      "已与 PDF 逐页核对。",
      "2026-07-18T12:00:00.000Z",
    );

    expect(() => transition_material_review(
      segment,
      verified_record,
      "published",
      complete_checklist,
      "申请发布。",
      "2026-07-18T12:01:00.000Z",
    )).toThrow("缺少本次练习所需的跟弹提示");
  });
});
