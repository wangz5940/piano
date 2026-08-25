import { courses, get_lessons_for_day, lessons, practice_days } from "./data";
import type { course, lesson, practice_day, user_progress } from "./types";

export function is_lesson_completed(lesson_id: string, progress: user_progress): boolean {
  return progress.completed_lesson_ids.includes(lesson_id);
}

export function is_curriculum_completed(progress: user_progress): boolean {
  return lessons.every((lesson) => is_lesson_completed(lesson.id, progress));
}

export function get_current_practice_day(progress: user_progress): practice_day {
  return (
    practice_days.find((practice_day) => !is_practice_day_completed(practice_day, progress)) ??
    practice_days[practice_days.length - 1]
  );
}

export function is_practice_day_completed(
  practice_day: practice_day,
  progress: user_progress,
): boolean {
  return practice_day.lesson_ids.every((lesson_id) => is_lesson_completed(lesson_id, progress));
}

export function is_practice_day_unlocked(
  practice_day: practice_day,
  progress: user_progress,
): boolean {
  const current_day = get_current_practice_day(progress);
  const candidate_index = practice_days.findIndex((item) => item.id === practice_day.id);
  const current_index = practice_days.findIndex((item) => item.id === current_day.id);

  return candidate_index >= 0 && candidate_index <= current_index;
}

export function is_lesson_unlocked(lesson_id: string, progress: user_progress): boolean {
  const lesson_data = lessons.find((lesson) => lesson.id === lesson_id);
  if (!lesson_data) {
    return false;
  }

  const lesson_day = practice_days.find((practice_day) =>
    practice_day.lesson_ids.includes(lesson_id),
  );
  return lesson_day ? is_practice_day_unlocked(lesson_day, progress) : false;
}

export function get_current_lesson(progress: user_progress): lesson {
  const current_day = get_current_practice_day(progress);
  return (
    get_lessons_for_day(current_day).find((lesson) => !is_lesson_completed(lesson.id, progress)) ??
    lessons[lessons.length - 1]
  );
}

export function get_next_lesson(lesson_id: string, progress: user_progress): lesson | undefined {
  const lesson_index = lessons.findIndex((lesson) => lesson.id === lesson_id);
  if (lesson_index < 0) {
    return undefined;
  }

  return lessons
    .slice(lesson_index + 1)
    .find((lesson) => is_lesson_unlocked(lesson.id, progress) && !is_lesson_completed(lesson.id, progress));
}

export function get_course_completion(course_id: string, progress: user_progress): number {
  const course_days = practice_days.filter((practice_day) => practice_day.course_id === course_id);
  if (course_days.length === 0) {
    return 0;
  }

  const completed_days = course_days.filter((practice_day) =>
    is_practice_day_completed(practice_day, progress),
  ).length;
  return completed_days / course_days.length;
}

export function get_current_course(progress: user_progress): course {
  const current_day = get_current_practice_day(progress);
  return courses.find((course) => course.id === current_day.course_id) ?? courses[0];
}

export function get_course_unlock_copy(course: course, progress: user_progress): string {
  if (course.available) {
    return get_course_completion(course.id, progress) === 1 ? "本阶段已完成，可随时复习" : "按每周 3 次的节奏循序推进";
  }

  const previous_course = courses[course.order - 2];
  if (previous_course && get_course_completion(previous_course.id, progress) < 1) {
    return `完成${previous_course.title.replace(/^[一二三四五六]、/, "")}后解锁`;
  }

  return "完成上一阶段后按顺序解锁";
}
