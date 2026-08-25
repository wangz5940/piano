import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  LockKeyhole,
  Play,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { courses, get_days_for_course, get_lessons_for_day } from "@/features/course/data";
import { resolve_published_lessons } from "@/features/curriculum/resolvePublishedLessons";
import type { active_curriculum } from "@/features/curriculum/types";
import { usePublishedCurriculum } from "@/features/curriculum/usePublishedCurriculum";
import {
  get_course_completion,
  get_current_practice_day,
  is_lesson_completed,
  is_practice_day_completed,
  is_practice_day_unlocked,
} from "@/features/course/unlock";
import { get_latest_result } from "@/features/progress/storage";
import type { hand_mode, lesson, practice_day } from "@/features/course/types";
import { use_progress_store } from "@/store/useProgressStore";
import { use_app_settings_store } from "@/store/useAppSettingsStore";

export function CoursePath() {
  const published_curriculum = usePublishedCurriculum();
  const progress = use_progress_store((state) => state.progress);
  const free_practice = use_app_settings_store((state) => state.free_practice);
  const current_day = get_current_practice_day(progress);

  return (
    <AppShell>
      <section className="page-intro path-intro">
        <div>
          <p className="eyebrow">36 周 · 6 个阶段 · 每周 3 次</p>
          <h1>练习不是赶进度，<br />而是把动作练成反应。</h1>
          <p className="intro-copy">
            每天都有热身、方法教材、技术、曲目和简谱视奏。前 8 周先用小汤建立手位和指法，第 9 周后再接入拜厄，最终目标是看到新谱也能组织双手。
          </p>
        </div>
        <div className="path-note">
          <span>当前原则</span>
          <strong>{free_practice ? "自由查看 + 慢速练习" : "慢速 + 连续 + 可复盘"}</strong>
          <p>
            {free_practice
              ? "所有周次都可以打开。建议先按当前进度学习，也可以提前查看后面的内容。"
              : "错一个音可以继续，丢掉节拍才需要回到更小的分句。"}
          </p>
          <Link to="/管理" className="path-settings-link">
            <SlidersHorizontal size={14} /> 管理学习权限
          </Link>
        </div>
      </section>

      <section className="course-timeline" aria-label="36 周课程路径">
        {courses.map((course) => {
          const completion = get_course_completion(course.id, progress);
          const is_current_course = course.id === current_day.course_id;
          const course_days = get_days_for_course(course.id);

          return (
            <article key={course.id} className="course-section">
              <div className="course-marker">
                <span>{String(course.order).padStart(2, "0")}</span>
                <i className={completion === 1 ? "is-complete" : is_current_course ? "is-current" : ""} />
              </div>
              <div className="course-content">
                <div className="course-heading">
                  <div>
                    <p className="section-kicker">第 {course.week_start}—{course.week_end} 周</p>
                    <h2>{course.title}</h2>
                    <p>{course.goal}</p>
                  </div>
                  <span>{Math.round(completion * 100)}% 完成</span>
                </div>

                <p className="course-material-note">{course.material_note}</p>
                <details className="course-standards">
                  <summary>
                    <CheckCircle2 size={16} />
                    这一阶段学到什么才算通过
                    <ChevronRight size={16} />
                  </summary>
                  <ol>
                    {course.completion_standards.map((standard) => (
                      <li key={standard}>{standard}</li>
                    ))}
                  </ol>
                </details>

                <div className="week-list">
                  {group_days_by_week(course_days).map(([week_number, week_days]) => {
                    const is_current_week = week_number === current_day.week_number;
                    const is_week_unlocked = week_days.some((day) =>
                      is_practice_day_unlocked(day, progress),
                    );

                    return (
                      <details
                        key={week_number}
                        className={`week-card ${is_current_week ? "is-current" : ""} ${free_practice || is_week_unlocked ? "is-unlocked" : "is-locked"}`}
                        open={is_current_week}
                      >
                        <summary>
                          <span className="week-label">第 {week_number} 周</span>
                          <strong>
                            {is_current_week
                              ? "本周进行中"
                              : free_practice
                                ? "可查看与练习"
                                : is_week_unlocked
                                  ? "可复习"
                                  : "完成上一周后解锁"}
                          </strong>
                          <ChevronRight size={17} />
                        </summary>
                        <div className="day-list">
                          {week_days.map((practice_day) => (
                            <PracticeDayCard
                              key={practice_day.id}
                              practice_day={practice_day}
                              progress={progress}
                              allow_unlearned_tasks={free_practice}
                              published_curriculum={published_curriculum}
                            />
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="method-note">
        <p className="section-kicker">教材规则</p>
        <p>
          第 1—4 周使用小汤 1，第 5—8 周使用小汤 2，第 9 周后进入拜厄。哈农只在第 13 周后作为 3—5 分钟辅助；未审核 MusicXML 只进入教材谱库核对，不用于逐音判定。
        </p>
        <Link to="/" className="text-link">回到今日练习 <ArrowRight size={16} /></Link>
      </section>
    </AppShell>
  );
}

function PracticeDayCard({
  practice_day,
  progress,
  allow_unlearned_tasks,
  published_curriculum,
}: {
  practice_day: practice_day;
  progress: ReturnType<typeof use_progress_store.getState>["progress"];
  allow_unlearned_tasks: boolean;
  published_curriculum: active_curriculum | undefined;
}) {
  const day_lessons = resolve_published_lessons(
    get_lessons_for_day(practice_day),
    published_curriculum,
  );
  const is_unlocked = is_practice_day_unlocked(practice_day, progress);
  const can_view = allow_unlearned_tasks || is_unlocked;
  const is_complete = is_practice_day_completed(practice_day, progress);
  const completed_count = day_lessons.filter((lesson) => is_lesson_completed(lesson.id, progress)).length;

  return (
    <section className={`day-card ${can_view ? "is-unlocked" : "is-locked"} ${is_complete ? "is-complete" : ""}`}>
      <div className="day-card-heading">
        <div>
          <span>
            本周第 {practice_day.day_index} 次
            {allow_unlearned_tasks && !is_unlocked ? " · 提前查看" : ""}
          </span>
          <h3>{practice_day.title}</h3>
          <p>{practice_day.objective}</p>
        </div>
        <strong>{completed_count}/5</strong>
      </div>

      {can_view ? (
        <div className="lesson-list">
          {day_lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} progress={progress} />
          ))}
        </div>
      ) : (
        <p className="day-lock-copy"><LockKeyhole size={15} /> 完成本周前一次练习后解锁</p>
      )}
    </section>
  );
}

function LessonCard({
  lesson,
  progress,
}: {
  lesson: lesson;
  progress: ReturnType<typeof use_progress_store.getState>["progress"];
}) {
  const is_complete = is_lesson_completed(lesson.id, progress);
  const result = get_latest_result(progress, lesson.id);

  return (
    <article className={`lesson-card is-unlocked ${is_complete ? "is-complete" : ""}`}>
      <div className="lesson-status">
        {is_complete ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </div>
      <div className="lesson-copy">
        <div className="lesson-title-line">
          <h3>{lesson.title}</h3>
          <span>{get_hand_label(lesson.hand_mode)}</span>
        </div>
        <p>{lesson.description}</p>
        <div className="lesson-meta">
          <span><Timer size={14} /> {lesson.estimated_minutes} 分钟</span>
          {lesson.target_bpm > 0 && <span>{lesson.target_bpm} BPM</span>}
          {result && lesson.practice_mode === "guided_input" && (
            <span>最近正确率 {Math.round(result.accuracy * 100)}%</span>
          )}
          {result?.note && <span>已记录复盘</span>}
        </div>
      </div>
      <Link to={`/练习/${lesson.id}`} className="lesson-action">
        {is_complete ? "复习" : "练习"} <Play size={14} fill="currentColor" />
      </Link>
    </article>
  );
}

function group_days_by_week(days: practice_day[]): Array<[number, practice_day[]]> {
  return Array.from(
    days.reduce<Map<number, practice_day[]>>((groups, practice_day) => {
      const week_days = groups.get(practice_day.week_number) ?? [];
      week_days.push(practice_day);
      groups.set(practice_day.week_number, week_days);
      return groups;
    }, new Map()),
  );
}

function get_hand_label(hand: hand_mode): string {
  if (hand === "both") {
    return "双手";
  }
  return hand === "left" ? "左手" : "右手";
}
