import type { lesson } from "@/features/course/types";
import { to_practice_score } from "@/features/score/toPracticeScore";

import type {
  active_curriculum,
  curriculum_node_record,
  published_curriculum_score_version,
} from "./types";

const exercise_types = new Set([
  "warmup",
  "method",
  "technique",
  "repertoire",
  "sight_reading",
]);

export function resolve_published_lesson(
  static_lesson: lesson,
  curriculum: active_curriculum | undefined,
): lesson {
  return apply_published_score(
    static_lesson,
    create_published_score_map(curriculum).get(static_lesson.id),
  );
}

export function resolve_published_lessons(
  static_lessons: lesson[],
  curriculum: active_curriculum | undefined,
): lesson[] {
  const published_scores = create_published_score_map(curriculum);
  return static_lessons.map((static_lesson) =>
    apply_published_score(
      static_lesson,
      published_scores.get(static_lesson.id),
    ));
}

interface published_lesson_score {
  score: ReturnType<typeof to_practice_score>;
  title: string;
  source_ref: string;
}

function create_published_score_map(
  curriculum: active_curriculum | undefined,
): Map<string, published_lesson_score> {
  const resolved = new Map<string, published_lesson_score>();
  if (
    !curriculum ||
    curriculum.status !== "published" ||
    curriculum.revision.status !== "published"
  ) {
    return resolved;
  }

  const nodes = new Map(curriculum.nodes.map((node) => [node.id, node]));
  const versions = new Map(
    curriculum.score_versions
      .filter(is_published_version)
      .map((version) => [version.id, version]),
  );
  const bindings = [...curriculum.lesson_score_bindings].sort((left, right) =>
    role_priority(left.role) - role_priority(right.role) ||
    left.position - right.position);

  for (const binding of bindings) {
    if (binding.role !== "primary") {
      continue;
    }
    const lesson_node = nodes.get(binding.lesson_node_id);
    const version = versions.get(binding.score_version_id);
    const static_id = lesson_node
      ? get_static_lesson_id(lesson_node, nodes)
      : undefined;
    if (!static_id || !version || resolved.has(static_id)) {
      continue;
    }

    const score = to_practice_score(version);
    resolved.set(static_id, {
      score,
      title: `${version.document.title} · 已发布教学谱`,
      source_ref:
        `${version.document.title} · 已发布 ScoreDocument ${version.id}`,
    });
  }

  return resolved;
}

function apply_published_score(
  static_lesson: lesson,
  published: published_lesson_score | undefined,
): lesson {
  if (!published) {
    return static_lesson;
  }
  return {
    ...static_lesson,
    title: published.title,
    source_ref: published.source_ref,
    hand_mode: get_score_hand_mode(published.score),
    score: published.score,
    steps: published.score.steps,
  };
}

function get_static_lesson_id(
  lesson_node: curriculum_node_record,
  nodes: Map<string, curriculum_node_record>,
): string | undefined {
  if (lesson_node.kind !== "lesson" || lesson_node.status !== "active") {
    return undefined;
  }
  const day_node = lesson_node.parent_id
    ? nodes.get(lesson_node.parent_id)
    : undefined;
  const week_number = get_number(day_node?.payload.week_number);
  const day_index = get_number(day_node?.payload.day_index);
  const exercise_type = lesson_node.payload.exercise_type;
  if (
    day_node?.kind !== "practice_day" ||
    !week_number ||
    !day_index ||
    typeof exercise_type !== "string" ||
    !exercise_types.has(exercise_type)
  ) {
    return undefined;
  }
  const static_exercise_type = exercise_type === "sight_reading"
    ? "sight"
    : exercise_type;
  return `w${week_number}-d${day_index}-${static_exercise_type}`;
}

function is_published_version(
  version: published_curriculum_score_version,
): boolean {
  return Boolean(version.published_at) &&
    version.document.status === "published" &&
    Boolean(version.document.review.published_at);
}

function role_priority(role: string): number {
  return role === "primary" ? 0 : 1;
}

function get_number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function get_score_hand_mode(
  score: ReturnType<typeof to_practice_score>,
): lesson["hand_mode"] {
  const hands = new Set(score.steps.map((step) => step.hand));
  if (hands.has("both") || (hands.has("left") && hands.has("right"))) {
    return "both";
  }
  return hands.has("left") ? "left" : "right";
}
