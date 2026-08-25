import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Management } from "./Management";

describe("学习管理", () => {
  it("展示自由学习和侧栏布局开关", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/管理"]}>
        <Management />
      </MemoryRouter>,
    );

    expect(markup).toContain("允许查看并练习未学习任务");
    expect(markup).toContain("默认收起左侧导航");
    expect(markup).toContain("默认显示谱面指法");
    expect(markup).toContain("麦克风判定");
    expect(markup).toContain("录制校准音");
    expect(markup).toContain('href="/课程"');
  });
});
