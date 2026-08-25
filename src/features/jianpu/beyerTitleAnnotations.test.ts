import { describe, expect, it } from "vitest";

import {
  beyer_special_title_page_annotations,
  beyer_special_title_total_count,
  get_beyer_title_annotation_for_pages,
} from "./beyerTitleAnnotations";

describe("beyerTitleAnnotations", () => {
  it("标注明确的第 12-109 条标题页码映射", () => {
    expect(beyer_special_title_total_count).toBe(98);
    expect(beyer_special_title_page_annotations[0]).toMatchObject({
      page: 22,
      title_numbers: [12, 13, 14, 15],
      label: "第 12-15 条",
    });
    expect(beyer_special_title_page_annotations.at(-1)).toMatchObject({
      page: 46,
      title_numbers: [108, 109],
      label: "第 108-109 条",
    });
  });

  it("可按当前原谱页提取标题编号摘要", () => {
    const summary = get_beyer_title_annotation_for_pages([22, 23]);

    expect(summary.total_count).toBe(98);
    expect(summary.selected_pages.map((page) => page.label)).toEqual([
      "第 12-15 条",
      "第 16-19 条",
    ]);
  });
});
