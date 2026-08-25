import { courses, lessons } from "@/features/course/data";
import { get_current_practice_day } from "@/features/course/unlock";
import type { lesson, practice_result, user_progress } from "@/features/course/types";

const storage_key = "lianqinbu.progress.v2";
const legacy_storage_key = "lianqinbu.progress.v1";

interface legacy_progress {
  schema_version: 1;
  completed_lesson_ids?: string[];
  results_by_lesson?: Record<string, practice_result>;
  last_practiced_on?: string;
  streak_days?: number;
}

export function create_initial_progress(): user_progress {
  return {
    schema_version: 2,
    current_phase_id: courses[0].id,
    current_week_number: 1,
    current_day_index: 1,
    completed_lesson_ids: [],
    results_by_lesson: {},
    weak_lesson_ids: [],
    streak_days: 0,
  };
}

export function load_progress(): user_progress {
  if (typeof window === "undefined") {
    return create_initial_progress();
  }

  try {
    const saved_progress = window.localStorage.getItem(storage_key);
    if (saved_progress) {
      const parsed_progress = JSON.parse(saved_progress) as Partial<user_progress>;
      if (parsed_progress.schema_version === 2 && Array.isArray(parsed_progress.completed_lesson_ids)) {
        return sync_current_position({
          ...create_initial_progress(),
          ...parsed_progress,
          results_by_lesson: parsed_progress.results_by_lesson ?? {},
          weak_lesson_ids: parsed_progress.weak_lesson_ids ?? [],
        });
      }
    }

    const legacy_progress = window.localStorage.getItem(legacy_storage_key);
    if (legacy_progress) {
      const migrated = migrate_legacy_progress(JSON.parse(legacy_progress) as legacy_progress);
      save_progress(migrated);
      return migrated;
    }
  } catch {
    return create_initial_progress();
  }

  return create_initial_progress();
}

export function save_progress(progress: user_progress): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storage_key, JSON.stringify(progress));
}

export function record_result(
  progress: user_progress,
  result: practice_result,
  pass_accuracy: number,
): user_progress {
  const is_passed = result.completed && result.accuracy >= pass_accuracy;
  const updated_progress = update_progress(
    progress,
    result,
    is_passed,
    result.accuracy < pass_accuracy,
  );

  return sync_current_position(updated_progress);
}

export function record_manual_completion(
  progress: user_progress,
  lesson_data: lesson,
  note?: string,
): user_progress {
  const now = Date.now();
  const result: practice_result = {
    lesson_id: lesson_data.id,
    started_at: now,
    completed_at: now,
    total_steps: 0,
    correct_steps: 0,
    mistakes: 0,
    early_steps: 0,
    late_steps: 0,
    max_combo: 0,
    accuracy: 1,
    completed: true,
    note,
    input_source: "manual",
    duration_ms: 0,
  };

  return sync_current_position(update_progress(progress, result, true, false));
}

export function get_latest_result(
  progress: user_progress,
  lesson_id: string,
): practice_result | undefined {
  const results = progress.results_by_lesson[lesson_id];
  return results?.[results.length - 1];
}

function update_progress(
  progress: user_progress,
  result: practice_result,
  completed: boolean,
  should_mark_weak: boolean,
): user_progress {
  const completion_date = new Date(result.completed_at);
  const yesterday_date = new Date(completion_date);
  yesterday_date.setDate(yesterday_date.getDate() - 1);
  const today = to_date_key(completion_date);
  const yesterday = to_date_key(yesterday_date);
  const is_new_day = progress.last_practiced_on !== today;
  const completed_lesson_ids =
    completed && !progress.completed_lesson_ids.includes(result.lesson_id)
      ? [...progress.completed_lesson_ids, result.lesson_id]
      : progress.completed_lesson_ids;
  const weak_lesson_ids = should_mark_weak
    ? Array.from(new Set([...progress.weak_lesson_ids, result.lesson_id]))
    : progress.weak_lesson_ids.filter((lesson_id) => lesson_id !== result.lesson_id);

  return {
    ...progress,
    completed_lesson_ids,
    weak_lesson_ids,
    results_by_lesson: {
      ...progress.results_by_lesson,
      [result.lesson_id]: [...(progress.results_by_lesson[result.lesson_id] ?? []), result].slice(-8),
    },
    last_practiced_on: today,
    streak_days: is_new_day
      ? progress.last_practiced_on === yesterday
        ? progress.streak_days + 1
        : 1
      : progress.streak_days,
  };
}

function sync_current_position(progress: user_progress): user_progress {
  const current_day = get_current_practice_day(progress);

  return {
    ...progress,
    current_phase_id: current_day.course_id,
    current_week_number: current_day.week_number,
    current_day_index: current_day.day_index,
  };
}

function migrate_legacy_progress(progress: legacy_progress): user_progress {
  const migrated = create_initial_progress();
  const known_lesson_ids = new Set(lessons.map((lesson) => lesson.id));
  const compatible_results = Object.entries(progress.results_by_lesson ?? {}).reduce<
    Record<string, practice_result[]>
  >((results, [lesson_id, result]) => {
    if (known_lesson_ids.has(lesson_id)) {
      results[lesson_id] = [{ ...result, completed: true }];
    }
    return results;
  }, {});
  const completed_lesson_ids = Array.from(new Set([
    ...(progress.completed_lesson_ids ?? []).filter((lesson_id) =>
      known_lesson_ids.has(lesson_id)),
    ...Object.keys(compatible_results),
  ]));

  return sync_current_position({
    ...migrated,
    completed_lesson_ids,
    results_by_lesson: compatible_results,
    last_practiced_on: progress.last_practiced_on,
    streak_days: progress.streak_days ?? 0,
  });
}

function to_date_key(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
