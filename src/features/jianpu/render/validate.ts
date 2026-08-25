import type {
  jianpu_hand,
  jianpu_render_hand_event,
  jianpu_render_measure,
  jianpu_render_score,
  jianpu_render_warning,
} from "./model";

const timing_epsilon = 0.0001;

export function validate_render_score(
  score: jianpu_render_score,
): jianpu_render_score {
  return {
    ...score,
    measures: score.measures.map((measure) => ({
      ...measure,
      warnings: validate_render_measure(measure),
    })),
  };
}

export function collect_render_warnings(
  score: jianpu_render_score,
): jianpu_render_warning[] {
  return score.measures.flatMap((measure) => measure.warnings);
}

function validate_render_measure(
  measure: jianpu_render_measure,
): jianpu_render_warning[] {
  const warnings: jianpu_render_warning[] = [];
  if (measure.content_beats > measure.meter.beats + timing_epsilon) {
    warnings.push({
      code: "measure_content_exceeds_declared_beats",
      measure_index: measure.index,
      message: `第 ${measure.number} 小节内容延伸到 ${format_beats(measure.content_beats)} 拍，超过 ${measure.meter.beats}/${measure.meter.beat_unit} 拍声明。`,
    });
  } else if (measure.content_beats + timing_epsilon < measure.meter.beats) {
    warnings.push({
      code: "measure_content_shorter_than_declared_beats",
      measure_index: measure.index,
      message: `第 ${measure.number} 小节只有 ${format_beats(measure.content_beats)} 拍内容，短于 ${measure.meter.beats}/${measure.meter.beat_unit} 拍声明。`,
    });
  }

  warnings.push(...validate_hand_timeline(measure, "right", measure.right));
  warnings.push(...validate_hand_timeline(measure, "left", measure.left));
  return deduplicate_warnings(warnings);
}

function validate_hand_timeline(
  measure: jianpu_render_measure,
  hand: jianpu_hand,
  events: jianpu_render_hand_event[],
): jianpu_render_warning[] {
  const sorted = [...events]
    .filter((event) => event.kind === "note")
    .sort((left, right) => left.onset_beats - right.onset_beats);
  const warnings: jianpu_render_warning[] = [];
  let previous: jianpu_render_hand_event | undefined;

  for (const event of sorted) {
    if (previous &&
      event.onset_beats + timing_epsilon <
        previous.onset_beats + previous.duration_beats &&
      event.voice === undefined &&
      previous.voice === undefined) {
      warnings.push({
        code: "event_overlaps_existing_event",
        measure_index: measure.index,
        hand,
        message: `第 ${measure.number} 小节${hand === "right" ? "右手" : "左手"}事件在 ${format_beats(event.onset_beats)} 拍发生重叠。`,
      });
      warnings.push({
        code: "missing_voice_information",
        measure_index: measure.index,
        hand,
        message: `第 ${measure.number} 小节存在重叠事件，但源数据没有 voice/layer 信息。`,
      });
    }
    if (!previous ||
      event.onset_beats + event.duration_beats >
        previous.onset_beats + previous.duration_beats) {
      previous = event;
    }
  }

  return warnings;
}

function deduplicate_warnings(
  warnings: jianpu_render_warning[],
): jianpu_render_warning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}-${warning.measure_index}-${warning.hand ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function format_beats(value: number): string {
  return Number(value.toFixed(3)).toString();
}
