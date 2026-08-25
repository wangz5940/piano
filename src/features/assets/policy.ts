import type {
  material_review_checklist,
  material_review_status,
  material_segment,
} from "./types";

const allowed_transitions: Record<material_review_status, material_review_status[]> = {
  candidate: ["needs_review", "validation_failed", "rejected"],
  validation_failed: ["needs_review", "rejected"],
  needs_review: ["verified", "validation_failed", "rejected"],
  verified: ["needs_review", "published", "rejected"],
  published: ["needs_review", "rejected"],
  rejected: ["needs_review"],
};

export const review_check_labels: Record<keyof material_review_checklist, string> = {
  structure_checked: "结构与时值校验",
  music_semantics_checked: "音乐语义核对",
  visual_pdf_checked: "原谱视觉核对",
  source_mapping_checked: "来源页与练习映射核对",
};

export function can_use_for_realtime_judgement(status: material_review_status): boolean {
  return status === "published";
}

export function create_empty_review_checklist(): material_review_checklist {
  return {
    structure_checked: false,
    music_semantics_checked: false,
    visual_pdf_checked: false,
    source_mapping_checked: false,
  };
}

export function is_review_checklist_complete(checks: material_review_checklist): boolean {
  return Object.values(checks).every(Boolean);
}

export function can_transition_material_status(
  from_status: material_review_status,
  to_status: material_review_status,
): boolean {
  return allowed_transitions[from_status].includes(to_status);
}

export function get_available_material_status_transitions(
  status: material_review_status,
): material_review_status[] {
  return allowed_transitions[status];
}

export function get_material_status_transition_label(status: material_review_status): string {
  const labels: Record<material_review_status, string> = {
    candidate: "进入人工审核",
    validation_failed: "标记暂不可用",
    needs_review: "打回复核",
    verified: "标记为已核对",
    published: "发布当前版本",
    rejected: "标记不可使用",
  };

  return labels[status];
}

export function get_publish_block_reason(
  segment: material_segment,
  checks: material_review_checklist,
): string | undefined {
  if (!is_review_checklist_complete(checks)) {
    return "请先完成四项审核证据。";
  }

  const derived_assets = segment.derived_assets;
  if (!derived_assets) {
    return "缺少本次练习所需的跟弹提示。";
  }
  if (derived_assets.source_sha256 !== segment.sha256) {
    return "跟弹提示与当前原谱版本不一致。";
  }
  if (!derived_assets.practice_events_url) {
    return "缺少本次练习所需的跟弹提示。";
  }

  return undefined;
}

export function get_material_status_label(status: material_review_status): string {
  const labels: Record<material_review_status, string> = {
    candidate: "待核对",
    validation_failed: "暂不可用",
    needs_review: "待人工核对",
    verified: "已核对",
    published: "已发布",
    rejected: "不可使用",
  };

  return labels[status];
}

export function get_material_status_copy(status: material_review_status): string {
  if (status === "published") {
    return "已发布：可进入正式课程，并提供跟弹提示。";
  }
  if (status === "verified") {
    return "已核对：仍需发布后才会进入正式课程。";
  }
  if (status === "rejected") {
    return "不可使用：该片段暂不适合作为练习内容。";
  }
  if (status === "validation_failed") {
    return "暂不可用：谱面内容还需要进一步整理。";
  }
  if (status === "candidate") {
    return "待核对：尚未完成谱面确认，不参与练习判错。";
  }
  return "待核对：仅供与原教材对照，不参与练习判错。";
}
