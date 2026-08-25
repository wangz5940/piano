import type {
  expected_step,
  lesson,
  score_source_excerpt,
} from "@/features/course/types";
import type { material_id, material_practice_event } from "./types";
import { apply_step_fingerings } from "@/features/course/fingerings";

import {
  get_material_segment,
  load_material_catalog,
  load_material_practice_events,
} from "./loadCatalog";
import {
  apply_material_review_records,
  load_material_review_records,
} from "./reviewGate";

export async function resolve_textbook_lesson(lesson_data: lesson): Promise<lesson> {
  const source = lesson_data.score.source;
  if (source.kind !== "musicxml") {
    return lesson_data;
  }

  const raw_catalog = await load_material_catalog();
  if (raw_catalog.review_only) {
    throw new Error("当前教材目录仅供核对，暂不能用于跟弹练习。");
  }
  const catalog = apply_material_review_records(
    raw_catalog,
    load_material_review_records(),
  );
  const excerpt_requests = source.excerpts?.length
    ? source.excerpts
    : source.source_page !== undefined
      ? get_page_excerpt_requests(
          catalog,
          infer_material_id_from_asset(source.asset_id),
          source.source_page,
          source.label,
        )
      : source.asset_id
      ? [{
          asset_id: source.asset_id,
          label: source.excerpt_label ?? source.label,
          measure_start: source.measure_start,
          measure_end: source.measure_end,
        }]
      : [];
  if (excerpt_requests.length === 0) {
    throw new Error("本次教材页面暂未接入可练习原谱。");
  }

  const steps: expected_step[] = [];
  const resolved_excerpts: score_source_excerpt[] = [];
  let next_measure_index = 1;
  let next_beat_index = 0;

  for (const request of excerpt_requests) {
    const material_id = infer_material_id_from_asset(request.asset_id);
    const segment = get_material_segment(catalog, material_id, request.asset_id);
    if (!segment) {
      throw new Error("本次教材原谱暂未接入，请先按页面中的练习谱手动练习。");
    }
    if (!segment.realtime_judgement_allowed || segment.status !== "published") {
      throw new Error("本次教材原谱仍在核对中，请先按纸本顺序完成手动练习。");
    }
    if (!segment.derived_assets?.practice_events_url) {
      throw new Error("本次教材原谱暂时无法提供跟弹提示，请稍后重试。");
    }

    const practice_events = await load_material_practice_events(
      segment.derived_assets.practice_events_url,
    );
    if (practice_events.asset_id !== segment.id) {
      throw new Error("本次教材跟弹提示暂时不可用，请稍后重试。");
    }
    if (practice_events.source_sha256 !== segment.sha256) {
      throw new Error("本次教材原谱已更新，请重新加载练习内容。");
    }

    const excerpt = select_excerpt(practice_events.events, request.measure_start, request.measure_end);
    if (excerpt.length === 0) {
      throw new Error("本次教材片段暂时没有可跟弹的内容，请先按原谱手动练习。");
    }

    const measure_indexes = Array.from(
      new Set(excerpt.map((event) => event.measure_index)),
    ).sort((left, right) => left - right);
    const local_measure_order = new Map(
      measure_indexes.map((measure_index, index) => [measure_index, index]),
    );
    const local_beat_offsets = get_measure_beat_offsets(
      excerpt,
      measure_indexes,
      lesson_data.score.beats_per_measure,
    );

    for (const event of excerpt) {
      const measure_order = local_measure_order.get(event.measure_index) ?? 0;
      steps.push(to_expected_step(
        event,
        next_measure_index + measure_order,
        next_beat_index + (local_beat_offsets.get(event.measure_index) ?? 0) +
          event.onset_beats,
        lesson_data.hand_mode,
      ));
    }

    const measure_start = measure_indexes[0];
    const measure_end = measure_indexes.at(-1) ?? measure_start;
    const render_measure_start = Number(excerpt[0].measure_number);
    const render_measure_end = Number(excerpt.at(-1)?.measure_number);
    resolved_excerpts.push({
      ...request,
      measure_start,
      measure_end,
      musicxml_url: segment.musicxml_url,
      practice_events_url: segment.derived_assets.practice_events_url,
      content_sha256: segment.sha256,
      render_measure_start: Number.isFinite(render_measure_start)
        ? render_measure_start
        : undefined,
      render_measure_end: Number.isFinite(render_measure_end)
        ? render_measure_end
        : undefined,
    });

    next_measure_index += measure_indexes.length;
    next_beat_index += get_excerpt_duration_beats(
      excerpt,
      measure_indexes,
      lesson_data.score.beats_per_measure,
    );
  }

  const steps_with_fingerings = apply_step_fingerings(steps, {
    tonic_midi: lesson_data.score.jianpu_tonic_midi,
  });
  const single_excerpt = resolved_excerpts.length === 1
    ? resolved_excerpts[0]
    : undefined;

  return {
    ...lesson_data,
    hand_mode: infer_hand_mode(steps_with_fingerings),
    practice_mode: "guided_input",
    pass_accuracy: lesson_data.pass_accuracy ?? 0.72,
    steps: steps_with_fingerings,
    score: {
      ...lesson_data.score,
      steps: steps_with_fingerings,
      source: {
        ...source,
        status: "published",
        musicxml_url: single_excerpt?.musicxml_url,
        practice_events_url: single_excerpt?.practice_events_url,
        content_sha256: single_excerpt?.content_sha256,
        measure_start: single_excerpt?.measure_start,
        measure_end: single_excerpt?.measure_end,
        render_measure_start: single_excerpt?.render_measure_start,
        render_measure_end: single_excerpt?.render_measure_end,
        excerpts: resolved_excerpts,
        label: source.label.includes("已接入跟弹提示")
          ? source.label
          : `${source.label} · 已接入跟弹提示`,
      },
    },
  };
}

function get_page_excerpt_requests(
  catalog: Awaited<ReturnType<typeof load_material_catalog>>,
  material_id: material_id,
  source_page: number,
  source_label: string,
): score_source_excerpt[] {
  const material = catalog.materials.find((item) => item.id === material_id);
  return (material?.segments ?? [])
    .filter((segment) => segment.source_pages.includes(source_page))
    .sort((left, right) => left.sequence - right.sequence)
    .map((segment, index) => ({
      asset_id: segment.id,
      label: `${source_label} · 第 ${index + 1} 段`,
    }));
}

function infer_material_id_from_asset(asset_id: string | undefined): material_id {
  if (asset_id?.startsWith("hanon.")) {
    return "hanon";
  }
  if (asset_id?.startsWith("john-thompson-easiest-1.")) {
    return "john-thompson-easiest-1";
  }
  if (asset_id?.startsWith("john-thompson-easiest-2.")) {
    return "john-thompson-easiest-2";
  }
  return "beyer";
}

function select_excerpt<T extends { measure_index: number }>(
  events: T[],
  requested_start?: number,
  requested_end?: number,
): T[] {
  const available_measures = Array.from(new Set(events.map((event) => event.measure_index))).sort(
    (left, right) => left - right,
  );
  if (available_measures.length === 0) {
    return [];
  }

  const first_measure = available_measures[0];
  const last_measure = available_measures.at(-1) ?? first_measure;
  if (requested_start !== undefined && !available_measures.includes(requested_start)) {
    throw new Error("本次教材片段的起始位置已变化，请重新核对课程范围。");
  }
  if (
    requested_end !== undefined &&
    (requested_end < first_measure || requested_end > last_measure)
  ) {
    throw new Error("本次教材片段的结束位置已变化，请重新核对课程范围。");
  }

  const start = requested_start ?? first_measure;
  const end = requested_end ?? last_measure;
  if (end < start) {
    throw new Error("本次教材片段的练习范围无效。");
  }
  const excerpt = events.filter((event) =>
    event.measure_index >= start && event.measure_index <= end);

  if (excerpt.length === 0) {
    throw new Error("本次教材片段没有可练习内容，请重新核对课程范围。");
  }
  return excerpt;
}

function to_expected_step(
  event: material_practice_event,
  measure_index: number,
  beat_index: number,
  intended_hand_mode: lesson["hand_mode"],
): expected_step {
  const hand = intended_hand_mode === "both"
    ? (event.notes.length > 1 ? "both" : event.hand)
    : intended_hand_mode;

  return {
    id: event.id,
    measure_index,
    beat_index,
    notation: event.notation,
    note_names: event.note_names,
    notes: event.notes,
    fingerings: event.fingerings,
    hand,
    duration_beats: event.duration_beats,
    match_mode: event.match_mode,
  };
}

function get_measure_beat_offsets(
  events: material_practice_event[],
  measure_indexes: number[],
  fallback_beats_per_measure: number,
): Map<number, number> {
  const offsets = new Map<number, number>();
  let offset = 0;

  for (const measure_index of measure_indexes) {
    offsets.set(measure_index, offset);
    offset += get_measure_duration_beats(
      events,
      measure_index,
      fallback_beats_per_measure,
    );
  }

  return offsets;
}

function get_excerpt_duration_beats(
  events: material_practice_event[],
  measure_indexes: number[],
  fallback_beats_per_measure: number,
): number {
  return measure_indexes.reduce(
    (total, measure_index) =>
      total + get_measure_duration_beats(events, measure_index, fallback_beats_per_measure),
    0,
  );
}

function get_measure_duration_beats(
  events: material_practice_event[],
  measure_index: number,
  fallback_beats_per_measure: number,
): number {
  const duration = events
    .filter((event) => event.measure_index === measure_index)
    .reduce(
      (maximum, event) =>
        Math.max(maximum, event.onset_beats + event.duration_beats),
      0,
    );

  return duration > 0 ? duration : fallback_beats_per_measure;
}

function infer_hand_mode(steps: expected_step[]): lesson["hand_mode"] {
  if (steps.some((step) => step.hand === "both")) {
    return "both";
  }
  if (steps.some((step) => step.hand === "left") && steps.some((step) => step.hand === "right")) {
    return "both";
  }
  return steps[0]?.hand ?? "both";
}
