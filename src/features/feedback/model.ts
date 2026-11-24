import type { feedback_draft, feedback_errors } from "./validation.mjs";

export interface feedback_entry extends feedback_draft {
  id: string;
  display_name: string;
  status: "pending" | "resolved";
  reply: string;
  created_at: string;
  images: { id: string; size_bytes: number; url: string }[];
}
export interface feedback_page { feedback: feedback_entry[]; next_offset: number | null }
export interface feedback_form_state {
  draft: feedback_draft;
  status: "editing" | "submitting" | "success";
  errors: feedback_errors;
  error: string;
}
export const initial_feedback_state: feedback_form_state = {
  draft: { feedback_type: "suggestion", message: "", contact: "" },
  status: "editing", errors: {}, error: "",
};
export type feedback_action =
  | { type: "change"; field: keyof feedback_draft; value: string }
  | { type: "invalid"; errors: feedback_errors }
  | { type: "submit" }
  | { type: "success" }
  | { type: "failure"; error: string }
  | { type: "reset" };

export function feedback_form_reducer(state: feedback_form_state, action: feedback_action): feedback_form_state {
  if (state.status === "submitting" && !["success", "failure"].includes(action.type)) return state;
  switch (action.type) {
    case "change": return {
      ...state, draft: { ...state.draft, [action.field]: action.value },
      status: "editing", error: "", errors: { ...state.errors, [action.field]: undefined },
    };
    case "invalid": return { ...state, status: "editing", errors: action.errors, error: "" };
    case "submit": return { ...state, status: "submitting", errors: {}, error: "" };
    case "success": return state.status === "submitting" ? { ...state, status: "success" } : state;
    case "failure": return { ...state, status: "editing", error: action.error };
    case "reset": return { ...initial_feedback_state, draft: { ...initial_feedback_state.draft } };
  }
}

export function feedback_status_label(entry: Pick<feedback_entry, "status" | "reply">): string {
  return entry.status === "resolved" ? "已处理" : entry.reply ? "已回复 · 待处理" : "待处理";
}
