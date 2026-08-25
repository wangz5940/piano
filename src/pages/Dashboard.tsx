import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleGauge,
  Clock3,
  KeyboardMusic,
  ListMusic,
  Music4,
  Play,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { courses, get_lessons_for_day, lessons } from "@/features/course/data";
import {
  resolve_published_lesson,
  resolve_published_lessons,
} from "@/features/curriculum/resolvePublishedLessons";
import { usePublishedCurriculum } from "@/features/curriculum/usePublishedCurriculum";
import {
  get_current_course,
  get_current_lesson,
  get_current_practice_day,
  is_curriculum_completed,
  is_lesson_completed,
} from "@/features/course/unlock";
import type { exercise_type, lesson, user_progress } from "@/features/course/types";
import { use_progress_store } from "@/store/useProgressStore";

interface dashboard_props {
  progress_override?: user_progress;
}

export function Dashboard({ progress_override }: dashboard_props = {}) {
  const published_curriculum = usePublishedCurriculum();
  const stored_progress = use_progress_store((state) => state.progress);
  const progress = progress_override ?? stored_progress;
  const current_day = get_current_practice_day(progress);
  const current_course = get_current_course(progress);
  const current_lesson = resolve_published_lesson(
    get_current_lesson(progress),
    published_curriculum,
  );
  const day_lessons = resolve_published_lessons(
    get_lessons_for_day(current_day),
    published_curriculum,
  );
  const completed_today = day_lessons.filter((lesson) => is_lesson_completed(lesson.id, progress)).length;
  const completed_count = progress.completed_lesson_ids.length;
  const total_progress = Math.round((completed_count / lessons.length) * 100);
  const curriculum_completed = is_curriculum_completed(progress);

  if (curriculum_completed) {
    return (
      <AppShell>
        <section className="page-intro dashboard-intro">
          <div>
            <p className="eyebrow">36 周课程 · 已完成</p>
            <h1>基础课程结业，<br />现在把能力带进真实曲目。</h1>
            <p className="intro-copy">
              你已完成全部 108 个练习日。接下来从记录中选择最需要巩固的项目复习，
              并保持每周三次完整演奏。
            </p>
          </div>
          <div className="today-stamp" aria-label="36 周课程已全部完成">
            <span>课程完成</span>
            <strong>{lessons.length}/{lessons.length}</strong>
            <small>36 周课程 100%</small>
          </div>
        </section>

        <section className="today-card">
          <div className="today-card-head">
            <div>
              <p className="section-kicker"><CheckCircle2 size={15} /> 结业后的练习方式</p>
              <h2>复习薄弱项目，并持续完整演奏。</h2>
            </div>
            <span className="course-chip">已结业</span>
          </div>
          <p className="today-guidance">
            优先回看低于通过线的练习，再从第 29—36 周选择一首曲目完整演奏，不再重复推进已完成课程。
          </p>
          <div className="practice-actions">
            <Link to="/记录" className="primary-button">
              查看练习记录 <ArrowRight size={17} />
            </Link>
            <Link to="/课程" className="secondary-button">
              选择课程复习
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page-intro dashboard-intro">
        <div>
          <p className="eyebrow">
            {current_course.short_title}阶段 · 第 {current_day.week_number} 周 · 本周第 {current_day.day_index} 次
          </p>
          <h1>
            今天不贪多，
            <br />
            只把一个动作练稳。
          </h1>
          <p className="intro-copy">
            {current_day.objective} 每次约 60 分钟：先让身体放松，再练技术，最后用新简谱检验是否真的能读出来。
          </p>
        </div>
        <div className="today-stamp" aria-label={`今日已完成 ${completed_today} 项`}>
          <span>今日完成</span>
          <strong>{completed_today}/5</strong>
          <small>36 周课程 {total_progress}%</small>
        </div>
      </section>

      <section className="today-card">
        <div className="today-card-head">
          <div>
            <p className="section-kicker">
              <Sparkles size={15} />
              今日主线
            </p>
            <h2>{current_day.title}</h2>
          </div>
          <span className="course-chip">第{current_day.week_number}周</span>
        </div>
        <p className="today-guidance">{current_lesson.guidance}</p>

        <div className="today-details">
          <span><Clock3 size={16} /> {current_day.time_budget_minutes} 分钟</span>
          <span><Music4 size={16} /> {current_lesson.target_bpm || "慢速"}{current_lesson.target_bpm ? " BPM" : ""}</span>
          <span><KeyboardMusic size={16} /> {get_hand_label(current_lesson.hand_mode)}</span>
        </div>

        <Link to={`/练习/${current_lesson.id}`} className="primary-button">
          <Play size={17} fill="currentColor" />
          {completed_today === 0 ? "从第一项开始" : "继续今日练习"}
          <ArrowRight size={17} />
        </Link>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-kicker">今日 60 分钟序列</p>
            <h2>从放松，到能连续读出一段新谱。</h2>
          </div>
          <span className="quiet-stat">
            <Check size={16} /> 连续练习 {progress.streak_days} 天
          </span>
        </div>

        <div className="practice-sequence">
          {day_lessons.map((lesson, index) => {
            const Icon = get_exercise_icon(lesson.exercise_type);
            const is_complete = is_lesson_completed(lesson.id, progress);

            return (
              <article
                key={lesson.id}
                className={`sequence-card ${is_complete ? "is-complete" : ""} ${lesson.id === current_lesson.id ? "is-current" : ""}`}
              >
                <div className="sequence-card-top">
                  <span className="plan-step">{String(index + 1).padStart(2, "0")}</span>
                  {is_complete ? <CheckCircle2 size={19} /> : <Icon size={19} />}
                </div>
                <p>{get_exercise_label(lesson.exercise_type)} · {lesson.estimated_minutes} 分钟</p>
                <h3>{lesson.title}</h3>
                <span className="plan-state">{is_complete ? "已完成" : lesson.id === current_lesson.id ? "现在练" : "待进行"}</span>
                <p className="plan-description">{lesson.description}</p>
                <Link to={`/练习/${lesson.id}`} className="sequence-link">
                  {is_complete ? "复习本项" : lesson.id === current_lesson.id ? "开始练习" : "查看内容"}
                  <ArrowRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="path-preview">
        <div>
          <p className="section-kicker">36 周路径</p>
          <h2>从第 1 周到第 36 周，能力按完成顺序逐级解锁。</h2>
        </div>
        <div className="path-dots" aria-label="课程路径">
          {courses.map((course) => (
            <div
              key={course.id}
              className={`path-dot ${course.id === current_course.id ? "is-current" : ""}`}
            >
              <span>{String(course.order).padStart(2, "0")}</span>
              <strong>{course.short_title}</strong>
            </div>
          ))}
        </div>
        <Link to="/课程" className="text-link">
          查看课程路径 <ArrowRight size={16} />
        </Link>
      </section>
    </AppShell>
  );
}

function get_hand_label(hand: lesson["hand_mode"]): string {
  if (hand === "both") {
    return "双手";
  }
  return hand === "left" ? "左手" : "右手";
}

function get_exercise_label(exercise: exercise_type): string {
  const labels: Record<exercise_type, string> = {
    warmup: "热身",
    method: "方法教材",
    technique: "技术",
    repertoire: "曲目",
    sight_reading: "简谱视奏",
  };
  return labels[exercise];
}

function get_exercise_icon(exercise: exercise_type) {
  const icons: Record<exercise_type, typeof KeyboardMusic> = {
    warmup: KeyboardMusic,
    method: ListMusic,
    technique: CircleGauge,
    repertoire: Music4,
    sight_reading: Sparkles,
  };
  return icons[exercise];
}
