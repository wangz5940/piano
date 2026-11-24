import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { account_user } from "@/features/auth/types";
const auth = vi.hoisted(() => ({ user: undefined as account_user | undefined, status: "guest" }));
vi.mock("@/store/useAuthStore", () => ({ use_auth_store: (selector: (state: typeof auth) => unknown) => selector(auth) }));
import { Feedback } from "./Feedback";

const user = { id: "feedback-user", email: "test@example.com", display_name: "学习者", role: "student" as const, status: "active" as const, created_at: "2026-11-24", updated_at: "2026-11-24" };
afterEach(() => { Object.assign(auth, { user: undefined, status: "idle" }); });
const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Feedback mode={path === "/后台/反馈" ? "admin" : path === "/反馈/历史" ? "history" : "submit"} /></MemoryRouter>);
describe("独立反馈页面", () => {
  it("未登录时展示独立导航与登录入口", () => {
    Object.assign(auth, { status: "guest", user: undefined });
    const markup = render("/反馈");
    expect(markup).toContain('aria-label="反馈导航"');
    expect(markup).toContain('href="/反馈/历史"');
    expect(markup).toContain("登录 / 注册");
    expect(markup).not.toContain('id="feedback-message"');
  });
  it("登录后展示类型、必填内容、可选联系及图片", () => {
    Object.assign(auth, { status: "authenticated", user });
    const markup = render("/反馈");
    for (const text of ["功能建议", "Bug反馈", "其他问题", "至少 10 个字符", "邮箱或手机号", "添加图片", "提交反馈", "重置表单"]) expect(markup).toContain(text);
    expect(markup).not.toContain("正在加载反馈");
  });
  it("历史页独立展示列表且不重复显示提交表单", () => {
    Object.assign(auth, { status: "authenticated", user });
    const markup = render("/反馈/历史");
    expect(markup).toContain("我的反馈");
    expect(markup).not.toContain('id="feedback-message"');
  });
  it("普通用户不能打开管理员反馈管理", () => {
    Object.assign(auth, { status: "authenticated", user });
    expect(render("/后台/反馈")).toContain("仅管理员可以查看全部反馈");
  });
  it("管理员有独立入口与全部反馈列表", () => {
    Object.assign(auth, { status: "authenticated", user: { ...user, role: "admin" } });
    const markup = render("/后台/反馈");
    expect(markup).toContain("全部反馈");
    expect(markup).toContain('href="/后台/反馈"');
    expect(markup).not.toContain('id="feedback-message"');
  });
});
