import type { score_document_event } from "@/features/score";

import {
  calibration_levels,
  type calibration_issue,
  type calibration_level,
  type calibration_project,
  type calibration_validation_result,
} from "./types";
import { validate_notation_sync } from "./notationSync";

const epsilon = 0.002;

export function validate_calibration_project(
  project: calibration_project,
): calibration_validation_result {
  const issues: calibration_issue[] = [];
  const issue = (
    level: calibration_level,
    severity: calibration_issue["severity"],
    code: string,
    message: string,
    context: Partial<Pick<
      calibration_issue,
      "measure_id" | "event_id" | "note_id"
    >> = {},
  ) => {
    issues.push({
      id: `${level}:${code}:${context.measure_id ?? ""}:${context.event_id ?? ""}:${context.note_id ?? ""}`,
      level,
      severity,
      code,
      message,
      ...context,
    });
  };

  if (!project.source.file_name) {
    issue("L0", "error", "source_not_attached", "尚未绑定已有内容来源。");
  }
  if (project.document.measures.length === 0) {
    issue("L0", "error", "empty_score", "数字乐谱没有小节。");
  }

  const measure_ids = new Set<string>();
  const event_ids = new Set<string>();
  const note_ids = new Set<string>();

  for (const measure of project.document.measures) {
    if (measure_ids.has(measure.id)) {
      issue("L0", "error", "duplicate_measure_id", `小节 ID ${measure.id} 重复。`, {
        measure_id: measure.id,
      });
    }
    measure_ids.add(measure.id);
    if (measure.meter.beats <= 0 || measure.meter.beat_unit <= 0) {
      issue("L0", "error", "invalid_meter", `${measure.number} 小节拍号无效。`, {
        measure_id: measure.id,
      });
    }

    for (const event of measure.events) {
      if (event_ids.has(event.id)) {
        issue("L1", "error", "duplicate_event_id", `事件 ID ${event.id} 重复。`, {
          measure_id: measure.id,
          event_id: event.id,
        });
      }
      event_ids.add(event.id);
      validate_event(measure.id, event, note_ids, issue);
    }
    validate_measure_rhythm(measure, issue);
  }
  validate_ties(project.document.measures, issue);
  for (const discrepancy of validate_notation_sync(project)) {
    issue(
      discrepancy.code.includes("time_signature") ? "L2" : "L1",
      "error",
      discrepancy.code,
      discrepancy.message,
      {
        measure_id: discrepancy.measure_id,
        event_id: discrepancy.event_id,
        note_id: discrepancy.note_id,
      },
    );
  }

  for (const event_id of event_ids) {
    const metadata = project.event_metadata[event_id];
    if (!metadata) {
      issue("L1", "error", "missing_event_metadata", `事件 ${event_id} 尚未校准谱表信息。`, {
        event_id,
      });
      continue;
    }
    if (
      metadata.source_page !== null &&
      project.source.page_count !== null &&
      metadata.source_page > project.source.page_count
    ) {
      issue("L0", "error", "source_page_out_of_range", `事件 ${event_id} 的来源页超出原件页数。`, {
        event_id,
      });
    }
    if (
      metadata.staff < 1 ||
      !["treble", "bass", "alto", "tenor", "percussion"].includes(
        metadata.clef,
      )
    ) {
      issue("L1", "error", "invalid_staff_or_clef", `事件 ${event_id} 的谱表或谱号尚未确认。`, {
        event_id,
      });
    }
  }

  const note_count = project.document.measures.reduce(
    (count, measure) =>
      count + measure.events.reduce(
        (event_count, event) => event_count + event.notes.length,
        0,
      ),
    0,
  );
  const fingering_count = project.document.measures.reduce(
    (count, measure) =>
      count + measure.events.reduce(
        (event_count, event) =>
          event_count + event.notes.filter((note) => note.finger !== undefined).length,
        0,
      ),
    0,
  );
  if (note_count > 0 && fingering_count < note_count) {
    issue(
      "L3",
      "warning",
      "incomplete_fingering",
      `还有 ${note_count - fingering_count} 个音符没有教学指法。`,
    );
  }
  if (project.document.hand_positions.length === 0) {
    issue("L3", "warning", "missing_hand_positions", "尚未建立手位与移动区段。");
  }

  const by_level = Object.fromEntries(calibration_levels.map((level) => {
    const level_issues = issues.filter((candidate) => candidate.level === level);
    const errors = level_issues.filter((candidate) => candidate.severity === "error").length;
    const warnings = level_issues.length - errors;
    return [level, { errors, warnings, passed: errors === 0 }];
  })) as calibration_validation_result["by_level"];

  return { issues, by_level };
}

export function can_complete_calibration_level(
  project: calibration_project,
  level: calibration_level,
  validation = validate_calibration_project(project),
): boolean {
  const level_index = calibration_levels.indexOf(level);
  const previous_levels = calibration_levels.slice(0, level_index);
  return validation.by_level[level].errors === 0 &&
    previous_levels.every((previous) =>
      project.levels[previous].status === "passed");
}

function validate_event(
  measure_id: string,
  event: score_document_event,
  note_ids: Set<string>,
  issue: (
    level: calibration_level,
    severity: calibration_issue["severity"],
    code: string,
    message: string,
    context?: Partial<Pick<
      calibration_issue,
      "measure_id" | "event_id" | "note_id"
    >>,
  ) => void,
): void {
  const context = { measure_id, event_id: event.id };
  if (event.onset_beats < 0) {
    issue("L1", "error", "negative_onset", "事件起拍不能小于 0。", context);
  }
  if (event.duration_beats <= 0) {
    issue("L1", "error", "invalid_duration", "事件时值必须大于 0。", context);
  }
  if (!Number.isInteger(event.voice) || event.voice < 1) {
    issue("L1", "error", "invalid_voice", "声部必须是从 1 开始的整数。", context);
  }
  for (const note of event.notes) {
    const note_context = { ...context, note_id: note.id };
    if (note_ids.has(note.id)) {
      issue("L1", "error", "duplicate_note_id", `音符 ID ${note.id} 重复。`, note_context);
    }
    note_ids.add(note.id);
    if (!Number.isInteger(note.midi) || note.midi < 21 || note.midi > 108) {
      issue("L1", "error", "invalid_pitch", `音符 ${note.id} 的 MIDI 音高超出钢琴范围。`, note_context);
    }
    if (note.finger !== undefined && (note.finger < 1 || note.finger > 5)) {
      issue("L3", "error", "invalid_fingering", `音符 ${note.id} 的指法无效。`, note_context);
    }
  }
}

function validate_measure_rhythm(
  measure: calibration_project["document"]["measures"][number],
  issue: Parameters<typeof validate_event>[3],
): void {
  const streams = new Map<string, score_document_event[]>();
  for (const event of measure.events) {
    const key = `${event.hand}:${event.voice}`;
    const stream = streams.get(key) ?? [];
    stream.push(event);
    streams.set(key, stream);
  }

  for (const [stream_key, stream] of streams) {
    const ordered = [...stream].sort((left, right) =>
      left.onset_beats - right.onset_beats ||
      left.id.localeCompare(right.id));
    let cursor = 0;
    for (const event of ordered) {
      if (event.onset_beats < cursor - epsilon) {
        issue(
          "L2",
          "error",
          "voice_overlap",
          `${measure.number} 小节 ${stream_key} 声部存在重叠事件。`,
          { measure_id: measure.id, event_id: event.id },
        );
      } else if (event.onset_beats > cursor + epsilon) {
        issue(
          "L2",
          "warning",
          "voice_gap",
          `${measure.number} 小节 ${stream_key} 声部存在未记录的空拍。`,
          { measure_id: measure.id, event_id: event.id },
        );
      }
      cursor = Math.max(cursor, event.onset_beats + event.duration_beats);
    }
    if (cursor > measure.meter.beats + epsilon) {
      issue(
        "L2",
        "error",
        "measure_overflow",
        `${measure.number} 小节 ${stream_key} 超出 ${measure.meter.beats} 拍。`,
        { measure_id: measure.id },
      );
    } else if (cursor < measure.meter.beats - epsilon) {
      issue(
        "L2",
        "warning",
        "measure_incomplete",
        `${measure.number} 小节 ${stream_key} 只有 ${format_beats(cursor)} / ${measure.meter.beats} 拍。`,
        { measure_id: measure.id },
      );
    }
  }
}

function validate_ties(
  measures: calibration_project["document"]["measures"],
  issue: Parameters<typeof validate_event>[3],
): void {
  const ordered = measures.flatMap((measure, measure_index) =>
    measure.events.map((event) => ({
      event,
      measure_id: measure.id,
      measure_index,
    }))).sort((left, right) =>
      left.measure_index - right.measure_index ||
      left.event.onset_beats - right.event.onset_beats ||
      left.event.id.localeCompare(right.event.id));
  ordered.forEach((entry, index) => {
    const { event, measure_id } = entry;
    if (event.tie !== "start") {
      return;
    }
    const pitches = new Set(event.notes.map((note) => note.midi));
    const continuation = ordered.slice(index + 1).find((candidate) =>
      candidate.event.hand === event.hand &&
      candidate.event.voice === event.voice &&
      (
        candidate.event.tie === "continue" ||
        candidate.event.tie === "stop"
      ) &&
      candidate.event.notes.some((note) => pitches.has(note.midi)));
    if (!continuation) {
      issue(
        "L2",
        "error",
        "orphan_tie",
        `事件 ${event.id} 的延音线没有找到同音高终点。`,
        { measure_id, event_id: event.id },
      );
    }
  });
}

function format_beats(value: number): string {
  return Number(value.toFixed(3)).toString();
}
