export type feedback_type = "suggestion" | "bug" | "other";
export interface feedback_draft { feedback_type: feedback_type; message: string; contact: string }
export type feedback_errors = Partial<Record<keyof feedback_draft, string>>;
export const feedback_types: { value: feedback_type; label: string }[];
export function validate_feedback(input: { feedback_type?: unknown; message?: unknown; contact?: unknown }): feedback_errors;
