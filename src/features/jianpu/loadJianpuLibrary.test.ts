import { afterEach, describe, expect, it, vi } from "vitest";

import { clear_jianpu_library_cache, load_jianpu_catalog } from "./loadJianpuLibrary";

describe("简谱教材目录加载", () => {
  afterEach(() => {
    clear_jianpu_library_cache();
    vi.restoreAllMocks();
  });

  it("读取可被校准保存回写的目录时绕开浏览器缓存", async () => {
    const fetch_mock = vi.fn(async () =>
      new Response(JSON.stringify({
        schema_version: "1.0",
        generated_at: "2026-08-25",
        materials: [{
          id: "beyer",
          title: "拜厄钢琴基本教程",
          description: "教材",
          page_count: 1,
          pages: [{
            page: 1,
            title: "第 1 页",
            text: "教材页内容",
            exercise_labels: [],
          }],
          chapters: [{
            id: "chapter-1",
            title: "第一章",
            description: "章节说明",
            page_start: 1,
            page_end: 1,
          }],
          segments: [{
            id: "beyer.segment.001",
            sequence: 1,
            title: "已更新标题",
            source_pages: [1],
            source_page_label: "PDF 第 1 页",
            page_slices: [{
              source_pages: [1],
              title: "已更新标题",
              text: "片段内容",
              measure_start: 1,
              measure_end: 1,
              chapter_id: "chapter-1",
              chapter_title: "第一章",
              mapping: "verified",
            }],
            exercise_labels: [],
            jianpu_url: "/materials/jianpu/beyer/001.json",
            musicxml_url: "/materials/beyer/001.musicxml",
            measure_count: 1,
            time_signature: "4/4",
            key_signature: "C 大调（1 = C）",
            tonic_midi: 60,
            hand_mode: "both",
            has_left_hand: true,
            chord_count: 0,
          }],
        }],
      }))) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetch_mock);

    await load_jianpu_catalog();

    expect(fetch_mock).toHaveBeenCalledWith("/api/v1/content/jianpu-materials", {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });
  });

  it("过滤已软删除的简谱教材片段", async () => {
    const fetch_mock = vi.fn(async () =>
      new Response(JSON.stringify(create_catalog({
        segments: [{
          id: "beyer.segment.001",
          deletion_status: "deleted",
        }, {
          id: "beyer.segment.002",
          deletion_status: "active",
        }],
      })))) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetch_mock);

    const catalog = await load_jianpu_catalog();

    expect(catalog.materials[0].segments.map((segment) => segment.id))
      .toEqual(["beyer.segment.002"]);
  });
});

function create_catalog({
  segments,
}: {
  segments: Array<{ id: string; deletion_status?: "active" | "deleted" }>;
}) {
  return {
    schema_version: "1.0",
    generated_at: "2026-08-25",
    materials: [{
      id: "beyer",
      title: "拜厄钢琴基本教程",
      description: "教材",
      page_count: 1,
      pages: [{
        page: 1,
        title: "第 1 页",
        text: "教材页内容",
        exercise_labels: [],
      }],
      chapters: [{
        id: "chapter-1",
        title: "第一章",
        description: "章节说明",
        page_start: 1,
        page_end: 1,
      }],
      segments: segments.map((segment, index) => ({
        id: segment.id,
        deletion_status: segment.deletion_status,
        sequence: index + 1,
        title: `片段 ${index + 1}`,
        source_pages: [1],
        source_page_label: "PDF 第 1 页",
        page_slices: [{
          source_pages: [1],
          title: `片段 ${index + 1}`,
          text: "片段内容",
          measure_start: 1,
          measure_end: 1,
          chapter_id: "chapter-1",
          chapter_title: "第一章",
          mapping: "verified",
        }],
        exercise_labels: [],
        jianpu_url: `/materials/jianpu/beyer/${index + 1}.json`,
        musicxml_url: `/materials/beyer/${index + 1}.musicxml`,
        measure_count: 1,
        time_signature: "4/4",
        key_signature: "C 大调（1 = C）",
        tonic_midi: 60,
        hand_mode: "both",
        has_left_hand: true,
        chord_count: 0,
      })),
    }],
  };
}
