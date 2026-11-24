export const feedback_types = [
  { value: "suggestion", label: "功能建议" },
  { value: "bug", label: "Bug反馈" },
  { value: "other", label: "其他问题" },
];

// Shared by the browser and API so Unicode text and optional contacts follow the same rules.
export function validate_feedback(input) {
  const errors = {};
  if (!feedback_types.some((type) => type.value === input.feedback_type)) {
    errors.feedback_type = "请选择反馈类型。";
  }
  const length = typeof input.message === "string" ? Array.from(input.message.trim()).length : 0;
  if (length < 10) errors.message = "请填写至少 10 个字符的反馈内容。";
  else if (length > 2000) errors.message = "反馈内容不能超过 2000 个字符。";
  const contact = typeof input.contact === "string" ? input.contact.trim() : "";
  if (typeof input.contact !== "string" || contact.length > 254 ||
    (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) &&
      !/^(?:\+?86[- ]?)?1[3-9]\d{9}$/.test(contact))) {
    errors.contact = "请填写有效的邮箱或手机号，或留空。";
  }
  return errors;
}
