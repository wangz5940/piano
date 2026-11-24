import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Management } from "./Management";

describe("学习管理", () => {
  it("展示功能设置并固定开启自由学习", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/管理"]}>
        <Management />
      </MemoryRouter>,
    );

    expect(markup).not.toContain("允许查看并练习未学习任务");
    expect(markup).not.toContain("课程访问");
    expect(markup).toContain("自由学习已开启");
    expect(markup).toContain("feature-settings-section");
    expect(markup).toContain('href="/反馈"');
    expect(markup).toContain("默认收起左侧导航");
    expect(markup).toContain("默认显示谱面指法");
    expect(markup).toContain("麦克风判定");
    expect(markup).toContain("录制校准音");
    expect(markup).toContain("按需开启更多功能");
    expect(markup).toContain('href="/简谱教材"');
    expect(markup).not.toContain('href="/课程"');
  });
});
