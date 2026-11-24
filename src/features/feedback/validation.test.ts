import { describe, expect, it } from "vitest";
import { validate_feedback } from "./validation.mjs";

const valid = { feedback_type: "suggestion", message: "希望增加练习速度调节功能", contact: "" };
describe("反馈表单校验", () => {
  it.each(["suggestion", "bug", "other"])("接受反馈类型 %s", (feedback_type) => {
    expect(validate_feedback({ ...valid, feedback_type })).toEqual({});
  });
  it.each(["", "   ", "文".repeat(9), "😀".repeat(9), undefined])("拒绝不足十个字符的内容 %s", (message) => {
    expect(validate_feedback({ ...valid, message })).toEqual({ message: "请填写至少 10 个字符的反馈内容。" });
  });
  it.each(["文".repeat(10), "😀".repeat(10), "文".repeat(2000), `  ${"文".repeat(10)}  `])("接受内容边界", (message) => {
    expect(validate_feedback({ ...valid, message })).toEqual({});
  });
  it("拒绝超过两千个字符", () => {
    expect(validate_feedback({ ...valid, message: "文".repeat(2001) }).message).toContain("2000");
  });
  it.each(["", "  ", "piano@example.com", "13812345678", "+86 13812345678", "8613812345678"])("接受可选联系方式 %s", (contact) => {
    expect(validate_feedback({ ...valid, contact })).toEqual({});
  });
  it.each(["hello", "foo@bar", "a@@b.com", "1381234567", "12312345678", "a b@c.com", "a".repeat(255), 123])("拒绝无效联系方式 %s", (contact) => {
    expect(validate_feedback({ ...valid, contact }).contact).toContain("有效的邮箱或手机号");
  });
  it("拒绝未知类型并同时返回各字段错误", () => {
    expect(Object.keys(validate_feedback({ feedback_type: "unknown", message: "", contact: "bad" }))).toEqual(["feedback_type", "message", "contact"]);
  });
});
