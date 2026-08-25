import { describe, expect, it } from "vitest";

import {
  can_transition_material_status,
  can_use_for_realtime_judgement,
  get_material_status_copy,
  is_review_checklist_complete,
} from "./policy";

describe("教材资源状态门禁", () => {
  it("只允许已发布谱例参与实时判定", () => {
    expect(can_use_for_realtime_judgement("published")).toBe(true);
    expect(can_use_for_realtime_judgement("candidate")).toBe(false);
    expect(can_use_for_realtime_judgement("needs_review")).toBe(false);
    expect(can_use_for_realtime_judgement("verified")).toBe(false);
  });

  it("为候选资源返回明确的人工核对提示", () => {
    expect(get_material_status_copy("needs_review")).toContain("不参与练习判错");
  });

  it("只允许按审核流程转换状态", () => {
    expect(can_transition_material_status("needs_review", "verified")).toBe(true);
    expect(can_transition_material_status("needs_review", "published")).toBe(false);
    expect(can_transition_material_status("verified", "published")).toBe(true);
    expect(can_transition_material_status("published", "verified")).toBe(false);
  });

  it("要求完整的审核证据才能进入已验证状态", () => {
    expect(is_review_checklist_complete({
      structure_checked: true,
      music_semantics_checked: true,
      visual_pdf_checked: true,
      source_mapping_checked: true,
    })).toBe(true);
    expect(is_review_checklist_complete({
      structure_checked: true,
      music_semantics_checked: false,
      visual_pdf_checked: true,
      source_mapping_checked: true,
    })).toBe(false);
  });
});
