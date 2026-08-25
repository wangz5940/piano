import { note_name } from "@/features/course/scoreBuilders";
import type {
  expected_step,
  hand_mode,
  practice_score,
} from "@/features/course/types";

import type {
  score_document_event,
  score_document_v2,
  score_hand,
} from "./types";

export interface published_score_version {
  id: string;
  score_id: string;
  source_sha256: string;
  document: score_document_v2;
  published_at?: string;
}

export function to_practice_score(
  version: published_score_version,
): practice_score {
  assert_published_version(version);

  const document = version.document;
  const steps = document.measures.flatMap((measure, measure_index) =>
    group_events_by_onset(measure.events).map(([onset, events], event_index) =>
      to_expected_step({
        document,
        events,
        event_index,
        measure_index,
        onset,
      })));
  const primary_position = document.hand_positions.find(
    (segment) => segment.hand === "right",
  ) ?? document.hand_positions[0];

  return {
    id: document.id,
    score_version_id: version.id,
    score_document: document,
    title: document.title,
    key_signature: document.key_signature,
    jianpu_tonic_midi: document.tonic_midi,
    time_signature: document.time_signature,
    beats_per_measure: document.measures[0]?.meter.beats ?? 4,
    tempo_hint: "使用已发布教学谱的课程速度；初次练习先降速并保持连续拍点。",
    start_position: primary_position
      ? `${primary_position.position_name}：${primary_position.annotation.reason}`
      : "先按调性和首个旋律音确认起始手位。",
    finger_hint: "优先使用已发布逐音指法；移动前先看下一小节的音域与手位提示。",
    finger_guide: {
      preparation: [
        `确认调性与主音：${document.key_signature}。`,
        "先看第一小节的手位、左右手和起拍位置。",
      ],
      actions: [
        "按小节慢速练习，先分手确认音高和指法，再合手连接。",
        "遇到 Move 或 Return 时先移动整手，再落下目标音。",
      ],
      success_checks: [
        "能按已发布谱面连续弹完当前乐句。",
        "能说明每次移动或回位的原因。",
      ],
      common_mistakes: [
        "只追逐单音而忽略手位变化。",
        "左手抢拍或没有保持完整时值。",
      ],
      position_strategy: document.hand_positions.map(
        (segment) => segment.annotation.reason,
      ),
      fingering_rules: [
        "逐音指法以已发布 ScoreDocument 为准。",
        "没有确认指法时先依据当前手位和后续旋律判断。",
      ],
      self_check: [
        "核对调性、拍号、左右手和每小节总拍数。",
        "指出 Position、Move、Return 所在小节。",
      ],
      position_map: document.hand_positions.map((segment) => ({
        label: segment.position_name,
        start_note: note_name(segment.covered_midis[0]),
        notes: segment.covered_midis.map(note_name),
        fingers: segment.finger_map.map((mapping) => String(mapping.finger)),
        applies_to: format_position_range(segment.range),
        reason: segment.annotation.reason,
        movement: segment.movement,
      })),
    },
    source: {
      kind: "inline",
      status: "published",
      label: `已发布 ScoreDocument v${version.id}`,
      content_sha256: version.source_sha256,
    },
    measure_beats: document.measures.map((measure) => measure.meter.beats),
    measure_beat_units: document.measures.map(
      (measure) => measure.meter.beat_unit,
    ),
    steps,
  };
}

function assert_published_version(version: published_score_version): void {
  if (!version.published_at || version.document.status !== "published") {
    throw new Error("只有已发布的 ScoreDocument 版本可以生成练习谱。");
  }
  if (version.document.review.published_at === null) {
    throw new Error("已发布 ScoreDocument 缺少发布时间。");
  }
}

function group_events_by_onset(
  events: score_document_event[],
): Array<[number, score_document_event[]]> {
  const groups = new Map<number, score_document_event[]>();
  for (const event of [...events].sort((left, right) =>
    left.onset_beats - right.onset_beats ||
    compare_hands(left.hand, right.hand) ||
    left.id.localeCompare(right.id))) {
    const group = groups.get(event.onset_beats) ?? [];
    group.push(event);
    groups.set(event.onset_beats, group);
  }
  return [...groups.entries()];
}

function to_expected_step({
  document,
  events,
  event_index,
  measure_index,
  onset,
}: {
  document: score_document_v2;
  events: score_document_event[];
  event_index: number;
  measure_index: number;
  onset: number;
}): expected_step {
  const notes = events.flatMap((event) => event.notes.map((note) => ({
    ...note,
    hand: event.hand,
  })));
  const hands = new Set(events.map((event) => event.hand));
  const hand: hand_mode = hands.size > 1
    ? "both"
    : events[0]?.hand ?? "right";
  const chord_labels = [...new Set(events.flatMap((event) =>
    event.chord ? [event.chord] : []))];
  const note_names = notes.map((note) => note_name(note.midi));
  const absolute_beat = document.measures
    .slice(0, measure_index)
    .reduce((total, measure) => total + measure.meter.beats, 0) + onset;

  return {
    id: `${document.id}-m${measure_index + 1}-e${event_index + 1}`,
    measure_index: measure_index + 1,
    beat_index: absolute_beat,
    beat_in_measure: onset,
    notation: [
      chord_labels.length > 0 ? chord_labels.join("/") : null,
      note_names.join("+"),
    ].filter(Boolean).join(" · "),
    note_names,
    notes: notes.map((note) => note.midi),
    fingerings: notes.flatMap((note) =>
      note.finger
        ? [{
            note: note.midi,
            hand: note.hand,
            finger: note.finger,
            source: "score" as const,
          }]
        : []),
    hand,
    duration_beats: Math.max(
      ...events.map((event) => event.duration_beats),
    ),
    match_mode: notes.length > 1 ? "chord" : "single_note",
  };
}

function compare_hands(left: score_hand, right: score_hand): number {
  const order: Record<score_hand, number> = { left: 0, right: 1 };
  return order[left] - order[right];
}

function format_position_range(
  range: score_document_v2["hand_positions"][number]["range"],
): string {
  if (range.start.measure_id === range.end.measure_id) {
    return `${range.start.measure_id} 第 ${range.start.beat + 1} 拍起`;
  }
  return `${range.start.measure_id} 至 ${range.end.measure_id}`;
}
