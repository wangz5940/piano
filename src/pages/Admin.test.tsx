import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Admin } from "./Admin";

describe("内容管理后台", () => {
  it("未登录时只显示登录入口", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/后台"]}>
        <Admin user_override={null} />
      </MemoryRouter>,
    );

    expect(markup).toContain("请先登录管理员账号");
    expect(markup).toContain('href="/账号"');
    expect(markup).not.toContain("上传新版本");
  });

  it("管理员可看到上传、版本发布和角色管理", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/后台"]}>
        <Admin
          user_override={{
            id: "admin-1",
            email: "admin@example.com",
            display_name: "管理员",
            role: "admin",
            status: "active",
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("上传新版本");
    expect(markup).toContain("版本与发布");
    expect(markup).toContain("数据库课程顺序");
    expect(markup).toContain("音符级 ScoreDocument 编辑");
    expect(markup).toContain("用户与角色");
    expect(markup).toContain("旧版本不会被覆盖");
    expect(markup).not.toContain("诗歌");
  });
});
