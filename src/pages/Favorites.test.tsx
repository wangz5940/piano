import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Favorites } from "./Favorites";

describe("收藏页", () => {
  it("在没有收藏时展示空态和主导航入口", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Favorites />
      </MemoryRouter>,
    );

    expect(markup).toContain("收藏");
    expect(markup).toContain("今日练习");
    expect(markup).toContain("还没有收藏曲谱");
    expect(markup).toContain("去热门曲目看看");
  });
});
