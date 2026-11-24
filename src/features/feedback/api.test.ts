import { beforeEach, describe, expect, it, vi } from "vitest";
import { api_request } from "@/features/api/client";
import { load_feedback, submit_feedback, update_feedback } from "./api";
vi.mock("@/features/api/client", () => ({ api_request: vi.fn() }));
const request = vi.mocked(api_request);
const draft = { feedback_type: "bug" as const, message: "  下一首曲谱显示位置需要调整  ", contact: "  piano@example.com  " };
beforeEach(() => { request.mockReset(); });

describe("反馈接口调用", () => {
  it("提交经过规范化的类型、内容、联系方式和图片", async () => {
    const response = { feedback: { id: "feedback-id" } };
    request.mockResolvedValue(response);
    const file = new File(["picture"], "score.png", { type: "image/png" });
    expect(await submit_feedback(draft, [file])).toEqual(response);
    const [path, options] = request.mock.calls[0];
    expect(path).toBe("/api/v1/feedback");
    expect(options?.method).toBe("POST");
    const body = options?.body as FormData;
    expect(body.get("message")).toBe(draft.message.trim());
    expect(body.get("feedback_type")).toBe("bug");
    expect(body.get("contact")).toBe("piano@example.com");
    expect(body.getAll("images")).toEqual([file]);
  });
  it("无效表单不发送请求", async () => {
    await expect(submit_feedback({ ...draft, message: "太短" }, [])).rejects.toThrow("至少 10");
    expect(request).not.toHaveBeenCalled();
  });
  it("提交失败传递接口错误，供表单保留内容和重试", async () => {
    const failure = new Error("服务繁忙，请重试。");
    request.mockRejectedValue(failure);
    await expect(submit_feedback(draft, [])).rejects.toBe(failure);
  });
  it.each(["mine", "all"] as const)("按范围 %s 读取分页", async (scope) => {
    request.mockResolvedValue({ feedback: [], next_offset: null });
    expect(await load_feedback(scope, 20)).toEqual({ feedback: [], next_offset: null });
    expect(request).toHaveBeenCalledWith(`/api/v1/feedback?scope=${scope}&offset=20`);
  });
  it.each(["pending", "resolved"] as const)("保存 %s 状态且允许空回复", async (status) => {
    request.mockResolvedValue({ feedback: { status, reply: "" } });
    await update_feedback("entry-id", "  ", status);
    expect(request).toHaveBeenCalledWith("/api/v1/feedback/entry-id", { method: "PATCH", body: { reply: "", status } });
  });
  it("保存规范化回复并传递失败", async () => {
    request.mockRejectedValue(new Error("没有管理权限"));
    await expect(update_feedback("entry-id", " 谢谢反馈 ", "pending")).rejects.toThrow("没有管理权限");
    expect(request).toHaveBeenCalledWith("/api/v1/feedback/entry-id", { method: "PATCH", body: { reply: "谢谢反馈", status: "pending" } });
  });
});
