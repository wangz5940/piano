import { describe, expect, it } from "vitest";

import {
  sanitize_score_image_name,
  split_svg_pages,
} from "./downloadScoreImage";

describe("曲谱图片下载", () => {
  it("清理不允许出现在下载文件名中的字符", () => {
    expect(sanitize_score_image_name('  练习一:原谱/右手?*  ')).toBe("练习一-原谱-右手");
    expect(sanitize_score_image_name("...")).toBe("曲谱");
  });

  it("长谱按浏览器安全高度切片并完整覆盖", () => {
    expect(split_svg_pages(15_250, 2)).toEqual([
      { source_index: 2, page_index: 0, offset: 0, height: 7_000 },
      { source_index: 2, page_index: 1, offset: 7_000, height: 7_000 },
      { source_index: 2, page_index: 2, offset: 14_000, height: 1_250 },
    ]);
    expect(split_svg_pages(0)).toEqual([
      { source_index: 0, page_index: 0, offset: 0, height: 0 },
    ]);
  });
});
