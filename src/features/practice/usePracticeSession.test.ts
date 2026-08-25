import { describe, expect, it } from "vitest";

import { get_lesson } from "@/features/course/data";
import type { expected_step, lesson, normalized_note_event } from "@/features/course/types";
import {
  initial_state,
  reduce_practice_state,
} from "./usePracticeSession";

describe("练习会话状态", () => {
  it("和弦音松开后不能与后续按键拼成命中", () => {
    const lesson_data = create_lesson([create_step([48, 64], 1)]);
    const started = reduce_practice_state(initial_state, {
      type: "start",
      timestamp: 0,
      bpm: 60,
    }, lesson_data);
    const partial = send_note(started, lesson_data, "note_on", 48, 1_000);
    const released = send_note(partial, lesson_data, "note_off", 48, 1_100);
    const next_note = send_note(released, lesson_data, "note_on", 64, 1_150);

    expect(next_note.phase).toBe("active");
    expect(next_note.current_step_index).toBe(0);
    expect(next_note.collected_notes).toEqual([64]);
  });

  it("明显节奏偏差会计入错误并降低通过率", () => {
    const lesson_data = create_lesson([create_step([60], 1)]);
    const started = reduce_practice_state(initial_state, {
      type: "start",
      timestamp: 0,
      bpm: 60,
    }, lesson_data);
    const completed = send_note(started, lesson_data, "note_on", 60, 2_000);

    expect(completed.phase).toBe("complete");
    expect(completed.correct_steps).toBe(1);
    expect(completed.mistakes).toBe(1);
  });

  it("长音提前离键不会完成当前步骤", () => {
    const lesson_data = create_lesson([create_step([60], 2)]);
    const started = reduce_practice_state(initial_state, {
      type: "start",
      timestamp: 0,
      bpm: 60,
    }, lesson_data);
    const holding = send_note(started, lesson_data, "note_on", 60, 1_000);
    const released_early = send_note(holding, lesson_data, "note_off", 60, 1_500);

    expect(holding.pending_hold).toBeDefined();
    expect(released_early.phase).toBe("active");
    expect(released_early.correct_steps).toBe(0);
    expect(released_early.mistakes).toBe(1);
  });

  it("保存结果使用真实整数时间而不是 performance.now 小数", () => {
    const lesson_data = create_lesson([create_step([60], 1)]);
    const started = reduce_practice_state(initial_state, {
      type: "start",
      timestamp: 12.5,
      started_at: 1_775_000_000_000,
      bpm: 60,
    }, lesson_data);
    const completed = send_note(started, lesson_data, "note_on", 60, 1_012.75);

    expect(completed.phase).toBe("complete");
    expect(completed.started_at).toBe(1_775_000_000_000);
    expect(completed.completed_at).toBe(1_775_000_001_000);
  });
});

function create_lesson(steps: expected_step[]): lesson {
  const base_lesson = get_lesson("w1-d1-technique");
  if (!base_lesson) {
    throw new Error("缺少测试课程");
  }
  return {
    ...base_lesson,
    steps,
    score: {
      ...base_lesson.score,
      steps,
    },
  };
}

function create_step(notes: number[], duration_beats: number): expected_step {
  return {
    id: "step-1",
    measure_index: 1,
    beat_index: 0,
    notation: "测试",
    note_names: notes.map(String),
    notes,
    hand: notes.length > 1 ? "both" : "right",
    duration_beats,
    match_mode: notes.length > 1 ? "chord" : "single_note",
  };
}

function send_note(
  state: typeof initial_state,
  lesson_data: lesson,
  type: normalized_note_event["type"],
  note: number,
  timestamp: number,
) {
  return reduce_practice_state(state, {
    type: "note",
    event: {
      type,
      note,
      velocity: type === "note_on" ? 96 : 0,
      timestamp,
      source: "midi",
    },
    bpm: 60,
  }, lesson_data);
}
