import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Clock3, Music4 } from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { get_course, get_lesson, practice_days } from "@/features/course/data";
import {
  get_current_practice_day,
  is_practice_day_completed,
} from "@/features/course/unlock";
import { get_latest_result } from "@/features/progress/storage";
import type { practice_result, user_progress } from "@/features/course/types";
import { use_progress_store } from "@/store/useProgressStore";
import { use_auth_store } from "@/store/useAuthStore";

interface records_props {
  progress_override?: user_progress;
}

export function Records({ progress_override }: records_props = {}) {
  const stored_progress = use_progress_store((state) => state.progress);
  const account_user = use_auth_store((state) => state.user);
  const progress = progress_override ?? stored_progress;
  const current_day = get_current_practice_day(progress);
  const current_course = get_course(current_day.course_id);
  const completed_days = practice_days.filter((practice_day) =>
    is_practice_day_completed(practice_day, progress),
  ).length;
  const recent_results = get_recent_results(progress);
  const weak_lessons = progress.weak_lesson_ids
    .map((lesson_id) => get_lesson(lesson_id))
    .filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));
  const visible_week_numbers = current_course
    ? Array.from(
        { length: current_course.week_end - current_course.week_start + 1 },
        (_, index) => current_course.week_start + index,
      )
    : [current_day.week_number];

  return (
    <AppShell>
      <section className="page-intro records-intro">
        <div>
          <p className="eyebrow">
            {account_user ? "账号练习记录 · 已启用多设备同步" : "本地练习记录 · 登录后可同步"}
          </p>
          <h1>记录不是打分，<br />是为了知道下一次该改什么。</h1>
          <p className="intro-copy">
            当前在{current_course?.title ?? "36 周课程"}第 {current_day.week_number} 周。每次只保留一个最需要修正的问题，让复盘能够真正改变下一次练习。
          </p>
        </div>
        <div className="record-stamp">
          <span>已完成练习日</span>
          <strong>{completed_days}</strong>
          <small>/ {practice_days.length} 天</small>
        </div>
      </section>

      <section className="record-overview" aria-label="练习概览">
        <article>
          <CalendarDays size={20} />
          <p>当前进度</p>
          <strong>第 {current_day.week_number} 周 · 第 {current_day.day_index} 次</strong>
        </article>
        <article>
          <CheckCircle2 size={20} />
          <p>已完成项目</p>
          <strong>{progress.completed_lesson_ids.length} 项</strong>
        </article>
        <article>
          <Clock3 size={20} />
          <p>连续练习</p>
          <strong>{progress.streak_days} 天</strong>
        </article>
      </section>

      <section className="record-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">本阶段情况</p>
            <h2>每周三次，留下清楚的完成痕迹。</h2>
          </div>
        </div>
        <div className="week-progress-grid">
          {visible_week_numbers.map((week_number) => {
            const days = practice_days.filter((practice_day) => practice_day.week_number === week_number);
            const completed = days.filter((day) => is_practice_day_completed(day, progress)).length;
            const is_current = week_number === current_day.week_number;

            return (
              <article key={week_number} className={`week-progress-card ${is_current ? "is-current" : ""}`}>
                <span>第 {week_number} 周</span>
                <strong>{completed}/3</strong>
                <div aria-label={`本周完成 ${completed} 天`}>
                  {days.map((day) => (
                    <i key={day.id} className={is_practice_day_completed(day, progress) ? "is-complete" : ""} />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="record-two-column">
        <div className="record-section">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-kicker">最近完成</p>
              <h2>练习记录</h2>
            </div>
          </div>
          <div className="record-list">
            {recent_results.length > 0 ? (
              recent_results.map(({ result, lesson_id }) => {
                const lesson = get_lesson(lesson_id);
                if (!lesson) {
                  return null;
                }

                return (
                  <article key={`${lesson_id}-${result.completed_at}`} className="record-row">
                    <Music4 size={18} />
                    <div>
                      <strong>{lesson.title}</strong>
                      <p>
                        {format_result(result)}
                        {result.note ? ` · ${result.note}` : ""}
                      </p>
                    </div>
                    <Link to={`/练习/${lesson.id}`} aria-label={`复习 ${lesson.title}`}>
                      <ArrowRight size={17} />
                    </Link>
                  </article>
                );
              })
            ) : (
              <p className="empty-record">完成第一项练习后，这里会保留正确率、时长和你的复盘备注。</p>
            )}
          </div>
        </div>

        <div className="record-section weak-section">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-kicker">下一次优先</p>
              <h2>需要回看的项目</h2>
            </div>
          </div>
          {weak_lessons.length > 0 ? (
            <div className="weak-list">
              {weak_lessons.map((lesson) => {
                const latest_result = get_latest_result(progress, lesson.id);
                return (
                  <Link key={lesson.id} to={`/练习/${lesson.id}`} className="weak-row">
                    <CircleAlert size={18} />
                    <span>
                      <strong>{lesson.title}</strong>
                      <small>最近正确率 {Math.round((latest_result?.accuracy ?? 0) * 100)}%</small>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="empty-record">当前没有低于通过线的引导练习。保持简谱视奏和双手曲目的节奏即可。</p>
          )}
        </div>
      </section>

      <section className="method-note">
        <p className="section-kicker">复盘方式</p>
        <p>
          不要写“弹得不好”。只记录可操作的事实，例如“左手换 F 和弦时提前”或“第 8 小节右手跳进找不到位置”，下一次只解决这一项。
        </p>
        <Link to="/" className="text-link">继续今日练习 <ArrowRight size={16} /></Link>
      </section>
    </AppShell>
  );
}

function get_recent_results(
  progress: ReturnType<typeof use_progress_store.getState>["progress"],
): Array<{ lesson_id: string; result: practice_result }> {
  return Object.entries(progress.results_by_lesson)
    .flatMap(([lesson_id, results]) => results.map((result) => ({ lesson_id, result })))
    .sort((left, right) => right.result.completed_at - left.result.completed_at)
    .slice(0, 8);
}

function format_result(result: practice_result): string {
  if (result.total_steps === 0) {
    return "已完成并记录";
  }
  return `正确率 ${Math.round(result.accuracy * 100)}% · 连击 ${result.max_combo}`;
}
