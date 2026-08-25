import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Account } from "./Account";

describe("账号与同步", () => {
  it("游客可以登录并看到本地进度合并说明", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/账号"]}>
        <Account user_override={null} sync_status_override="local" />
      </MemoryRouter>,
    );

    expect(markup).toContain("登录并同步");
    expect(markup).toContain("注册");
    expect(markup).toContain("本机记录不会丢失");
    expect(markup).not.toContain("session");
  });

  it("管理员账号显示内容后台入口", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/账号"]}>
        <Account
          sync_status_override="synced"
          user_override={{
        id: "admin-1",
        email: "admin@example.com",
        display_name: "内容管理员",
        role: "admin",
        status: "active",
        created_at: "2026-07-20T00:00:00.000Z",
        updated_at: "2026-07-20T00:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("内容管理员");
    expect(markup).toContain("已同步到账号");
    expect(markup).toContain('href="/后台"');
  });
});
