import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clear_material_asset_cache, load_musicxml_text } from "@/features/assets/loadCatalog";
import { prefetch_work_musicxml } from "./workScore";
import type { jianpu_segment } from "./types";

const segment = {
  musicxml_url: "/score.musicxml",
  sources: [
    { musicxml_url: "/score.musicxml" },
    { musicxml_url: "/score.musicxml" },
  ],
} as jianpu_segment;

beforeEach(clear_material_asset_cache);
afterEach(() => vi.unstubAllGlobals());

describe("原谱预取复用现有资源缓存", () => {
  it("同一源的多个范围和并发预取只下载一次，校准清缓存后读取同 URL 的新内容", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<score>before</score>"));
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([prefetch_work_musicxml(segment), prefetch_work_musicxml(segment)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await load_musicxml_text(segment.musicxml_url)).toBe("<score>before</score>");
    clear_material_asset_cache();
    fetcher.mockResolvedValue(new Response("<score>after</score>"));
    expect(await load_musicxml_text(segment.musicxml_url)).toBe("<score>after</score>");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("预取失败不会污染后续点击加载", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("<score>recovered</score>"));
    vi.stubGlobal("fetch", fetcher);
    await expect(prefetch_work_musicxml(segment)).rejects.toThrow("503");
    expect(await load_musicxml_text(segment.musicxml_url)).toBe("<score>recovered</score>");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
