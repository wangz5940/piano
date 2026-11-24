import { describe, expect, it } from "vitest";
import { feedback_form_reducer as reduce, feedback_status_label, initial_feedback_state } from "./model";
const filled = { ...initial_feedback_state, draft: { feedback_type: "bug" as const, message: "下一首曲谱位置需要调整", contact: "13812345678" } };

describe("反馈表单状态流转", () => {
  it("编辑只清除当前字段错误", () => {
    const state = { ...filled, errors: { message: "内容过短", contact: "无效手机号" }, error: "请求失败" };
    expect(reduce(state, { type: "change", field: "message", value: "修改后的完整反馈内容" })).toMatchObject({
      draft: { ...filled.draft, message: "修改后的完整反馈内容" }, status: "editing", error: "", errors: { message: undefined, contact: "无效手机号" },
    });
  });
  it("校验失败保持表单并展示字段错误", () => {
    expect(reduce(filled, { type: "invalid", errors: { contact: "联系方式无效" } })).toEqual({ ...filled, errors: { contact: "联系方式无效" } });
  });
  it("提交后阻止重复提交、编辑和重置，成功后允许重置", () => {
    const submitting = reduce(filled, { type: "submit" });
    expect(submitting.status).toBe("submitting");
    expect(reduce(submitting, { type: "submit" })).toBe(submitting);
    expect(reduce(submitting, { type: "reset" })).toBe(submitting);
    expect(reduce(submitting, { type: "change", field: "message", value: "替换" })).toBe(submitting);
    const success = reduce(submitting, { type: "success" });
    expect(success.status).toBe("success");
    expect(success.draft).toEqual(filled.draft);
    expect(reduce(success, { type: "reset" })).toEqual(initial_feedback_state);
  });
  it("失败保留输入，支持重试并清除请求错误", () => {
    const failure = reduce(reduce(filled, { type: "submit" }), { type: "failure", error: "网络连接失败" });
    expect(failure).toMatchObject({ status: "editing", draft: filled.draft, error: "网络连接失败" });
    expect(reduce(failure, { type: "submit" })).toMatchObject({ status: "submitting", error: "", draft: filled.draft });
  });
  it("非提交状态不接受成功结果", () => {
    expect(reduce(filled, { type: "success" })).toBe(filled);
  });
  it.each([
    { status: "pending" as const, reply: "", label: "待处理" },
    { status: "pending" as const, reply: "已收到", label: "已回复 · 待处理" },
    { status: "resolved" as const, reply: "", label: "已处理" },
    { status: "resolved" as const, reply: "已修正", label: "已处理" },
  ])("展示处理状态 $label", ({ status, reply, label }) => {
    expect(feedback_status_label({ status, reply })).toBe(label);
  });
});
