import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { lessons } from "@/features/course/data";
import { create_initial_progress } from "@/features/progress/storage";
import { Dashboard } from "./Dashboard";

describe("今日练习页", () => {
  it("为首次练习展示第 1 周第 1 次的完整日计划", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(markup).toContain("手指编号与中央 C");
    expect(markup).toContain("热身与手型");
    expect(markup).toContain("今日 60 分钟序列");
    expect(markup).toContain('href="/练习/w1-d1-warmup"');
  });

  it("完成全部课程后展示结业态而不是重复最后一课", () => {
    const progress = {
      ...create_initial_progress(),
      completed_lesson_ids: lessons.map((lesson) => lesson.id),
    };

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <Dashboard progress_override={progress} />
      </MemoryRouter>,
    );

    expect(markup).toContain("36 周课程 · 已完成");
    expect(markup).toContain("基础课程结业");
    expect(markup).not.toContain('href="/练习/w36-d3-sight"');
  });
});
