import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  hymn_repertoire_entries,
  imported_jianpu_entries,
  imported_teaching_entries,
  repertoire_entries,
} from "@/features/repertoire/data";
import { RepertoireLibrary } from "./RepertoireLibrary";

describe("热门曲目库", () => {
  it("将公版教学谱与全部授权整首教学版分区展示", () => {
    expect(repertoire_entries.length).toBeGreaterThanOrEqual(9);
    expect(repertoire_entries.every((entry) =>
      entry.rights_note.includes("公版") &&
      entry.rights_note.includes("重新编写") &&
      entry.score.steps.length > 0)).toBe(true);
    expect(imported_teaching_entries).toHaveLength(10);
    expect(imported_teaching_entries.every((entry) =>
      entry.score.steps.length > 0 &&
      entry.rights_note.includes("整首结构化教学谱") &&
      entry.score.source.reference_image?.url.includes("/materials/jianpu-imported/"))).toBe(true);
    expect(hymn_repertoire_entries.length).toBeGreaterThanOrEqual(12);
    expect(hymn_repertoire_entries.every((entry) =>
      entry.rights_note.includes("PPTX OOXML") &&
      entry.score.source.kind === "reference" &&
      entry.score.source.status === "needs_review" &&
      entry.score.source.reference_image === undefined &&
      entry.score.source.content_sha256?.length === 64 &&
      entry.score.steps.length === 0)).toBe(true);
    const kd_searching = imported_teaching_entries.find((entry) => entry.title.includes("KD Searching"));
    expect(kd_searching?.score.measure_beats).toHaveLength(24);
    expect(kd_searching?.score.measure_beats?.[18]).toBe(3);
    expect(kd_searching?.score.steps.at(-1)?.duration_beats).toBeGreaterThan(4);
    expect(imported_jianpu_entries.length).toBeGreaterThanOrEqual(10);
    expect(imported_jianpu_entries.every((entry) =>
      entry.page_count > 0 &&
      entry.pages.length === entry.page_count &&
      entry.preview_image.url.includes("/materials/jianpu-imported/") &&
      entry.source_url.includes("gangqinpu.com/jianpu/") &&
      entry.rights_note.includes("整首结构化教学谱"))).toBe(true);
    expect(imported_jianpu_entries.some((entry) => entry.title.includes("孤勇者"))).toBe(true);
    expect(imported_jianpu_entries.some((entry) => entry.title.includes("Flower Dance"))).toBe(true);
    expect(imported_jianpu_entries.some((entry) => entry.source_title.includes("Free Piano Sheet"))).toBe(false);
    expect(imported_jianpu_entries.find((entry) => entry.title.includes("KD Searching"))?.rights_note)
      .toContain("整首结构化教学谱");

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RepertoireLibrary />
      </MemoryRouter>,
    );

    expect(markup).toContain("公版教学谱");
    expect(markup).toContain("诗歌练习");
    expect(markup).toContain("授权教学版");
    expect(markup).toContain("《致爱丽丝》主题旋律骨架");
    expect(markup).toContain("《耶稣爱我》");
    expect(markup).toContain("《信靠耶稣何其甘甜》");
    expect(markup).toContain("<code>712首-文字</code> 的 SimpMusic PPTX");
    expect(markup).toContain("PPTX OOXML 来源已接入");
    expect(markup).not.toContain("本地 <code>.trae/歌谱</code> 的 JPG 原谱");
    expect(markup).toContain("《KD Searching》 · 整首");
    expect(markup).toContain("《孤勇者》");
    expect(markup).toContain("《Flower Dance》");
    expect(markup).toContain("《D 大调卡农》和声骨架");
    expect(markup).toContain("Christian Petzold");
    expect(markup).toContain("全部导入曲目已结构化");
    expect(markup).not.toContain("源简谱对照");
    expect(markup).toContain("我的收藏");
    expect(markup).toContain("一键收起");
    expect(markup).toContain("一键展开");
    expect(markup).toContain("《欢乐颂》主题");
    expect(markup).toContain("《KD Searching》 · 整首");
    expect(markup).toContain('href="#repertoire-ode-to-joy"');
    expect(markup).not.toContain("查看授权来源");
    expect(markup).not.toContain("查看导入来源");
    expect(markup).not.toContain("原谱待整理");
    expect(markup).not.toContain("River Flows In You");
    expect(markup).not.toContain("Free Piano Sheet Music Download");
  });
});
