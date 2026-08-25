import { describe, expect, it } from "vitest";

import { get_lessons_for_day, lessons, practice_days } from "./data";
import {
  get_current_lesson,
  get_current_practice_day,
  is_curriculum_completed,
  is_lesson_unlocked,
  is_practice_day_unlocked,
} from "./unlock";
import type { user_progress } from "./types";

function create_progress(completed_lesson_ids: string[] = []): user_progress {
  return {
    schema_version: 2,
    current_phase_id: "keyboard-foundation",
    current_week_number: 1,
    current_day_index: 1,
    completed_lesson_ids,
    results_by_lesson: {},
    weak_lesson_ids: [],
    streak_days: 0,
  };
}

describe("课程解锁规则", () => {
  it("默认解锁第 1 周第 1 次的全部五项练习", () => {
    const progress = create_progress();
    const first_day = practice_days[0];

    expect(is_practice_day_unlocked(first_day, progress)).toBe(true);
    expect(is_lesson_unlocked("w1-d1-warmup", progress)).toBe(true);
    expect(is_lesson_unlocked("w1-d2-warmup", progress)).toBe(false);
    expect(get_current_lesson(progress).id).toBe("w1-d1-warmup");
  });

  it("完成一个练习日的五项练习后解锁下一次", () => {
    const first_day = practice_days[0];
    const progress = create_progress(first_day.lesson_ids);
    const second_day = practice_days[1];

    expect(get_current_practice_day(progress).id).toBe(second_day.id);
    expect(is_practice_day_unlocked(second_day, progress)).toBe(true);
    expect(get_current_lesson(progress).id).toBe("w1-d2-warmup");
  });

  it("未知课次不会被误解锁", () => {
    expect(is_lesson_unlocked("missing-lesson", create_progress())).toBe(false);
  });

  it("全部课程完成后进入明确结业状态", () => {
    expect(is_curriculum_completed(
      create_progress(lessons.map((lesson) => lesson.id)),
    )).toBe(true);
  });

  it("全部 108 个练习日均为 60 分钟且包含五类练习", () => {
    expect(practice_days).toHaveLength(108);
    for (const practice_day of practice_days) {
      const day_lessons = get_lessons_for_day(practice_day);

      expect(practice_day.time_budget_minutes).toBe(60);
      expect(day_lessons).toHaveLength(5);
      expect(day_lessons.reduce((total, lesson) => total + lesson.estimated_minutes, 0)).toBe(60);
    }
  });
});
