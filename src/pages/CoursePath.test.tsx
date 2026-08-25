import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { use_app_settings_store } from "@/store/useAppSettingsStore";

import { CoursePath } from "./CoursePath";

afterEach(() => {
  use_app_settings_store.getState().set_sidebar_collapsed(false);
  use_app_settings_store.getState().set_free_practice(true);
});

describe("课程路径", () => {
  it("默认允许查看并练习尚未开始的后续周次", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/课程"]}>
        <CoursePath />
      </MemoryRouter>,
    );

    expect(markup).toContain("可查看与练习");
    expect(markup).toContain("提前查看");
    expect(markup).toContain('href="/练习/w36-d3-sight"');
  });
});
