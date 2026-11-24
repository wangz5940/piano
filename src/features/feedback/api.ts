import { api_request } from "@/features/api/client";
import { validate_feedback } from "./validation.mjs";
import type { feedback_draft } from "./validation.mjs";
import type { feedback_entry, feedback_page } from "./model";

export function submit_feedback(draft: feedback_draft, files: File[]) {
  const error = Object.values(validate_feedback(draft))[0];
  if (error) return Promise.reject(new Error(error));
  const body = new FormData();
  body.append("feedback_type", draft.feedback_type);
  body.append("message", draft.message.trim());
  body.append("contact", draft.contact.trim());
  files.forEach((file) => body.append("images", file));
  return api_request<{ feedback: feedback_entry }>("/api/v1/feedback", { method: "POST", body });
}

export function load_feedback(scope: "mine" | "all", offset: number) {
  return api_request<feedback_page>(`/api/v1/feedback?scope=${scope}&offset=${offset}`);
}

export function update_feedback(id: string, reply: string, status: feedback_entry["status"]) {
  return api_request<{ feedback: feedback_entry }>(`/api/v1/feedback/${id}`, {
    method: "PATCH", body: { reply: reply.trim(), status },
  });
}
