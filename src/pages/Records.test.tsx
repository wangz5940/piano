import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { lessons } from "@/features/course/data";
import { create_initial_progress } from "@/features/progress/storage";
import { Records } from "./Records";

describe("练习记录页", () => {
  it("进入第 9 周后展示当前阶段周进度", () => {
    const progress = {
      ...create_initial_progress(),
      completed_lesson_ids: lessons
        .filter((lesson) => lesson.week_number < 9)
        .map((lesson) => lesson.id),
    };

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/记录"]}>
        <Records progress_override={progress} />
      </MemoryRouter>,
    );

    expect(markup).toContain("第 9 周");
    expect(markup).toContain("第 12 周");
    expect(markup).not.toContain("第 1 周</span>");
  });
});
