import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { lessons } from "@/features/course/data";
import type { practice_result } from "@/features/course/types";
import {
  create_initial_progress,
  load_progress,
  record_result,
} from "./storage";

const original_tz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai";
});

afterAll(() => {
  process.env.TZ = original_tz;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("练习进度存储", () => {
  it("迁移仅含结果记录的旧进度时保留完成状态", () => {
    const lesson_id = lessons[0].id;
    const values = new Map<string, string>([
      ["lianqinbu.progress.v1", JSON.stringify({
        schema_version: 1,
        results_by_lesson: {
          [lesson_id]: create_result(lesson_id, Date.now()),
        },
      })],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const progress = load_progress();

    expect(progress.completed_lesson_ids).toContain(lesson_id);
    expect(progress.results_by_lesson[lesson_id]).toHaveLength(1);
  });

  it("按用户本地日期累计跨午夜的连续练习", () => {
    const lesson_id = lessons[0].id;
    const first_time = new Date(2026, 6, 18, 23, 30).getTime();
    const second_time = new Date(2026, 6, 19, 0, 30).getTime();

    const first_progress = record_result(
      create_initial_progress(),
      create_result(lesson_id, first_time),
      0.8,
    );
    const second_progress = record_result(
      first_progress,
      create_result(lesson_id, second_time),
      0.8,
    );

    expect(first_progress.streak_days).toBe(1);
    expect(second_progress.streak_days).toBe(2);
  });
});

function create_result(lesson_id: string, completed_at: number): practice_result {
  return {
    lesson_id,
    started_at: completed_at - 1_000,
    completed_at,
    total_steps: 1,
    correct_steps: 1,
    mistakes: 0,
    early_steps: 0,
    late_steps: 0,
    max_combo: 1,
    accuracy: 1,
    completed: true,
  };
}
