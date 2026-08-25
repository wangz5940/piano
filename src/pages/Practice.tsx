import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  KeyboardMusic,
  ListChecks,
  Mic,
  Play,
  RotateCcw,
  SlidersHorizontal,
  TimerReset,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { PianoKeyboard } from "@/components/PianoKeyboard";
import { PracticeScore } from "@/components/PracticeScore";
import { usePracticeAudio } from "@/features/audio/usePracticeAudio";
import { get_lesson } from "@/features/course/data";
import type { lesson, normalized_note_event } from "@/features/course/types";
import { resolve_published_lesson } from "@/features/curriculum/resolvePublishedLessons";
import { usePublishedCurriculum } from "@/features/curriculum/usePublishedCurriculum";
import { resolve_textbook_lesson } from "@/features/assets/resolveTextbookLesson";
import { useMidiInput } from "@/features/midi/useMidiInput";
import { get_beat_duration_ms } from "@/features/practice/engine";
import { format_step_fingerings } from "@/features/course/fingerings";
import { computer_keyboard_map } from "@/features/practice/computerKeyboard";
import { usePracticeSession } from "@/features/practice/usePracticeSession";
import { get_next_lesson } from "@/features/course/unlock";
import { useAudioPitchInput } from "@/features/audio/useAudioPitchInput";
import { use_app_settings_store } from "@/store/useAppSettingsStore";
import { use_progress_store } from "@/store/useProgressStore";

export function Practice() {
  const { lesson_id } = useParams();
  const published_curriculum = usePublishedCurriculum();
  const static_lesson = get_lesson(lesson_id);
  const lesson = static_lesson
    ? resolve_published_lesson(static_lesson, published_curriculum)
    : undefined;
  const navigate = useNavigate();
  const save_practice_result = use_progress_store((state) => state.save_practice_result);
  const complete_manual_lesson = use_progress_store((state) => state.complete_manual_lesson);
  const progress = use_progress_store((state) => state.progress);
  const audio_input_enabled = use_app_settings_store((state) => state.audio_input_enabled);
  const audio_tuning_offset_cents = use_app_settings_store((state) => state.audio_tuning_offset_cents);
  const show_fingerings = use_app_settings_store((state) => state.show_fingerings);
  const [bpm, set_bpm] = useState(lesson?.target_bpm || 52);
  const [review_note, set_review_note] = useState("");
  const [resolved_lesson, set_resolved_lesson] = useState<lesson>();
  const [resolve_error, set_resolve_error] = useState<string>();
  const [resolve_attempt, set_resolve_attempt] = useState(0);
  const latest_input_source_ref = useRef<normalized_note_event["source"]>("virtual_piano");
  const is_textbook_lesson = lesson?.score.source.kind === "musicxml";

  useEffect(() => {
    if (!lesson) {
      set_resolved_lesson(undefined);
      set_resolve_error(undefined);
      return;
    }
    if (!is_textbook_lesson) {
      set_resolved_lesson(lesson);
      set_resolve_error(undefined);
      return;
    }

    let active = true;
    set_resolved_lesson(undefined);
    set_resolve_error(undefined);
    void with_timeout(
      resolve_textbook_lesson(lesson),
      8000,
      "本次教材练习准备时间较长。请点击重试，或稍后再继续练习。",
    )
      .then((resolved) => {
        if (active) {
          set_resolved_lesson(resolved);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          set_resolve_error(get_textbook_load_error_message(error));
        }
      });

    return () => {
      active = false;
    };
  }, [is_textbook_lesson, lesson, resolve_attempt]);

  useEffect(() => {
    set_bpm(lesson?.target_bpm || 52);
    set_review_note("");
  }, [lesson?.id, lesson?.target_bpm]);

  const active_lesson = resolved_lesson ?? lesson ?? get_lesson("w1-d1-technique")!;
  const { state, result, start, reset, receive_note } = usePracticeSession(
    active_lesson,
    bpm,
  );
  const { metronome_enabled, set_metronome_enabled, play_feedback, play_click } =
    usePracticeAudio(get_beat_duration_ms(bpm));
  const saved_result_ref = useRef<number | undefined>();

  const handle_note = useCallback(
    (event: normalized_note_event) => {
      if (event.type === "note_on") {
        latest_input_source_ref.current = event.source;
      }
      receive_note(event);
    },
    [receive_note],
  );

  const midi = useMidiInput(handle_note);
  const {
    status: audio_status,
    current_pitch,
    connect: connect_audio,
    disconnect: disconnect_audio,
  } = useAudioPitchInput(handle_note, {
    tuning_offset_cents: audio_tuning_offset_cents,
  });

  useEffect(() => {
    if (audio_input_enabled) {
      void connect_audio();
    } else {
      disconnect_audio();
    }
  }, [connect_audio, disconnect_audio, audio_input_enabled]);

  useEffect(() => {
    if (state.feedback.kind !== "idle") {
      play_feedback(state.feedback.kind);
    }
  }, [play_feedback, state.feedback]);

  useEffect(() => {
    if (result && saved_result_ref.current !== result.completed_at) {
      save_practice_result({
        ...result,
        input_source: latest_input_source_ref.current,
        bpm,
        last_measure_index: active_lesson.steps?.at(-1)?.measure_index,
        duration_ms: Math.max(0, result.completed_at - result.started_at),
      }, active_lesson.pass_accuracy ?? 0.8);
      saved_result_ref.current = result.completed_at;
    }
  }, [active_lesson.pass_accuracy, active_lesson.steps, bpm, result, save_practice_result]);

  useEffect(() => {
    const handle_keydown = (event: KeyboardEvent) => {
      if (event.repeat || is_editable_target(event.target)) {
        return;
      }

      const midi_note = computer_keyboard_map.get(event.key.toLowerCase());
      if (midi_note === undefined) {
        return;
      }

      event.preventDefault();
      handle_note({
        type: "note_on",
        note: midi_note,
        velocity: 96,
        timestamp: performance.now(),
        source: "keyboard",
      });
    };
    const handle_keyup = (event: KeyboardEvent) => {
      if (is_editable_target(event.target)) {
        return;
      }

      const midi_note = computer_keyboard_map.get(event.key.toLowerCase());
      if (midi_note === undefined) {
        return;
      }

      handle_note({
        type: "note_off",
        note: midi_note,
        velocity: 0,
        timestamp: performance.now(),
        source: "keyboard",
      });
    };

    window.addEventListener("keydown", handle_keydown);
    window.addEventListener("keyup", handle_keyup);
    return () => {
      window.removeEventListener("keydown", handle_keydown);
      window.removeEventListener("keyup", handle_keyup);
    };
  }, [handle_note]);

  if (!lesson) {
    return <Navigate to="/课程" replace />;
  }

  const is_loading_textbook = is_textbook_lesson && !resolved_lesson && !resolve_error;
  const fallback_lesson = resolve_error
    ? { ...lesson, practice_mode: "manual_checklist" as const }
    : undefined;
  const is_guided = active_lesson.practice_mode === "guided_input" && !resolve_error;
  const steps = active_lesson.steps ?? [];
  const current_step = state.phase === "complete" ? undefined : steps[state.current_step_index];
  const accuracy = result?.accuracy ?? get_live_accuracy(state.correct_steps, state.mistakes);
  const can_start = state.phase === "idle";
  const is_passed = result ? result.accuracy >= (active_lesson.pass_accuracy ?? 0.8) : false;

  const handle_start = () => {
    play_click();
    start(performance.now(), Date.now());
  };

  const handle_virtual_note = (
    note: number,
    type: normalized_note_event["type"],
  ) => {
    handle_note({
      type,
      note,
      velocity: type === "note_on" ? 96 : 0,
      timestamp: performance.now(),
      source: "virtual_piano",
    });
  };

  const handle_manual_complete = () => {
    if (resolve_error) {
      return;
    }
    complete_manual_lesson(active_lesson, review_note.trim() || undefined);
    go_to_next_lesson();
  };

  const go_to_next_lesson = () => {
    const next_lesson = get_next_lesson(active_lesson.id, progress);
    navigate(next_lesson ? `/练习/${next_lesson.id}` : "/");
  };

  return (
    <main className="practice-page">
      <header className="practice-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={17} />
          今日练习
        </Link>
        <div className="practice-header-title">
          <span>{get_practice_mode_label(active_lesson.practice_mode)}</span>
          <strong>{active_lesson.title}</strong>
        </div>
        <button type="button" className="subtle-button" onClick={reset}>
          <RotateCcw size={16} />
          重置本项
        </button>
      </header>

      <section className="practice-layout">
        {is_loading_textbook ? (
          <TextbookLessonLoading lesson={lesson} />
        ) : resolve_error ? (
          <SelfDirectedPractice
            lesson={fallback_lesson ?? lesson}
            review_note={review_note}
            set_review_note={set_review_note}
            on_complete={handle_manual_complete}
            fallback_error={resolve_error}
            on_retry={() => set_resolve_attempt((attempt) => attempt + 1)}
            completion_locked
          />
        ) : is_guided ? (
          <div className="practice-main">
            <div className="practice-title-row">
              <div>
                <p className="eyebrow">{get_material_label(active_lesson)} · {get_hand_label(active_lesson.hand_mode)}</p>
                <h1>{active_lesson.description}</h1>
              </div>
              <TempoControl bpm={bpm} set_bpm={set_bpm} />
            </div>

            <PracticeScore
              score={active_lesson.score}
              current_step_index={state.current_step_index}
              favorite_href={`/练习/${active_lesson.id}`}
              favorite_subtitle={`第 ${active_lesson.week_number} 周第 ${active_lesson.day_index} 天 · ${active_lesson.exercise_type}`}
            />

            <div className={`beat-stage ${state.phase === "active" ? "is-active" : ""}`}>
              <div className="beat-orbit" />
              <div className="beat-copy">
                <span>{state.phase === "complete" ? "完成" : `第 ${Math.min(state.current_step_index + 1, steps.length)} / ${steps.length} 拍`}</span>
                <strong>{current_step?.notation ?? "✓"}</strong>
                <small>
                  {current_step
                    ? `${current_step.note_names.join(" + ")}${show_fingerings ? ` · 指法 ${format_step_fingerings(current_step)}` : ""}`
                    : "这一句已完成"}
                </small>
              </div>
            </div>

            <div className={`feedback-panel is-${state.feedback.kind}`} role="status" aria-live="polite">
              {state.feedback.kind === "wrong" ? <CircleAlert size={19} /> : <CheckCircle2 size={19} />}
              <div>
                <strong>{state.feedback.timing ?? "准备好"}</strong>
                <p>{state.feedback.message}</p>
              </div>
            </div>

            <PianoKeyboard
              active_notes={state.active_notes}
              target_notes={current_step?.notes ?? []}
              range_notes={steps.flatMap((step) => step.notes)}
              incorrect_notes={state.incorrect_notes}
              on_note_on={(note) => handle_virtual_note(note, "note_on")}
              on_note_off={(note) => handle_virtual_note(note, "note_off")}
            />

            <div className="practice-actions">
              {can_start ? (
                <button type="button" className="primary-button" onClick={handle_start}>
                  <Play size={17} fill="currentColor" />
                  开始并听一拍
                </button>
              ) : state.phase === "complete" ? (
                <>
                  <button
                    type="button"
                    className={is_passed ? "secondary-button" : "primary-button"}
                    onClick={reset}
                  >
                    <RotateCcw size={17} />
                    再练一次
                  </button>
                  {is_passed && (
                    <button type="button" className="primary-button" onClick={go_to_next_lesson}>
                      继续下一项
                      <ArrowRight size={17} />
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="secondary-button" onClick={reset}>
                  <RotateCcw size={17} />
                  从第 1 拍重新来
                </button>
              )}
            </div>
          </div>
        ) : (
          <SelfDirectedPractice
            lesson={active_lesson}
            review_note={review_note}
            set_review_note={set_review_note}
            on_complete={handle_manual_complete}
          />
        )}

        <aside className="practice-sidebar">
          {is_guided && !is_loading_textbook && (
            <section className="input-panel">
              <p className="section-kicker"><KeyboardMusic size={15} /> 输入方式</p>
              <h2>连接你的电钢琴</h2>
              <p>通过 USB 连接后，浏览器会直接读取按键；不连接也可用电脑键盘或点击琴键。</p>
              <button
                type="button"
                className="midi-button"
                onClick={() => void midi.connect()}
                disabled={midi.status === "requesting"}
              >
                <KeyboardMusic size={17} />
                {get_midi_button_label(midi.status)}
              </button>
              {midi.devices.length > 0 && (
                <label className="midi-select-label">
                  当前输入
                  <select
                    value={midi.active_device_id}
                    onChange={(event) => midi.select_device(event.target.value)}
                  >
                    {midi.devices.map((device) => (
                      <option key={device.id} value={device.id}>{device.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <p className="input-status">{get_midi_status_copy(midi.status)}</p>
              {audio_input_enabled ? (
                <div className="audio-practice-input">
                  <p className="section-kicker"><Mic size={15} /> 声音输入</p>
                  <button
                    type="button"
                    className="midi-button"
                    onClick={() => {
                      if (audio_status === "connected") {
                        disconnect_audio();
                      } else {
                        void connect_audio();
                      }
                    }}
                  >
                    <Mic size={17} />
                    {audio_status === "connected" ? "断开麦克风" : "连接麦克风"}
                  </button>
                  <p className="input-status">
                    {current_pitch
                      ? `检测到 ${current_pitch.note_name} · ${current_pitch.frequency.toFixed(1)} Hz`
                      : get_audio_input_status_copy(audio_status)}
                  </p>
                </div>
              ) : (
                <p className="input-status">
                  声音输入已关闭，可在<Link to="/管理" className="inline-settings-link">学习管理</Link>中开启。
                </p>
              )}
            </section>
          )}

          <section className="practice-stats">
            <p className="section-kicker"><SlidersHorizontal size={15} /> 本项状态</p>
            <dl>
              <div>
                <dt>{is_guided ? "正确率" : "目标时长"}</dt>
                <dd>{is_guided ? `${Math.round(accuracy * 100)}%` : `${active_lesson.estimated_minutes} 分`}</dd>
              </div>
              <div>
                <dt>{is_guided ? "最佳连击" : "材料"}</dt>
                <dd>{is_guided ? state.max_combo : get_material_label(active_lesson)}</dd>
              </div>
              <div>
                <dt>目标速度</dt>
                <dd>{active_lesson.target_bpm || "慢速"} {active_lesson.target_bpm ? <small>BPM</small> : null}</dd>
              </div>
            </dl>
          </section>

          {is_guided && !is_loading_textbook && (
            <section className="metronome-panel">
              <div>
                <p className="section-kicker">节拍器</p>
                <p>{metronome_enabled ? "正在提供稳定拍点" : "需要时再打开拍点"}</p>
              </div>
              <button
                type="button"
                className={`icon-toggle ${metronome_enabled ? "is-on" : ""}`}
                onClick={() => set_metronome_enabled((enabled) => !enabled)}
                aria-label={metronome_enabled ? "关闭节拍器" : "打开节拍器"}
              >
                {metronome_enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </section>
          )}

          <section className="source-panel">
            <p className="section-kicker">材料说明</p>
            <p>{active_lesson.source_ref ?? "原创教学练习"}</p>
          </section>

          {result && (
            <section className={`result-card ${is_passed ? "is-passed" : ""}`}>
              <CheckCircle2 size={21} />
              <div>
                <strong>{is_passed ? "这一项已通过" : "这一句完成，建议再来一次"}</strong>
                <p>
                  {is_passed
                    ? `正确率 ${Math.round(result.accuracy * 100)}%，可以继续今天下一项。`
                    : `通过线是 ${Math.round((active_lesson.pass_accuracy ?? 0.8) * 100)}%，先把错误音减少一点。`}
                </p>
              </div>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function with_timeout<T>(
  promise: Promise<T>,
  timeout_ms: number,
  timeout_message: string,
): Promise<T> {
  let timeout_id: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeout_id = setTimeout(() => {
      reject(new Error(timeout_message));
    }, timeout_ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeout_id !== undefined) {
      clearTimeout(timeout_id);
    }
  });
}

function get_textbook_load_error_message(error: unknown): string {
  if (error instanceof Error && error.message.includes("已更新")) {
    return "本次教材原谱已更新，请重新加载练习内容。";
  }
  if (error instanceof Error && error.message.includes("核对中")) {
    return "本次教材原谱仍在核对中，请先按纸本顺序完成手动练习。";
  }
  if (error instanceof Error && error.message.includes("跟弹提示")) {
    return "本次教材原谱可以查看，但逐拍跟弹提示暂时未能加载。请点击重试。";
  }
  if (error instanceof Error && error.message.includes("准备时间较长")) {
    return error.message;
  }
  return "本次教材练习内容暂时未能加载。请检查网络后重试，也可先按页面中的练习谱手动练习。";
}

function TextbookLessonLoading({ lesson }: { lesson: lesson }) {
  return (
    <div className="practice-main textbook-lesson-state">
      <Clock3 size={25} />
      <p className="section-kicker">正在准备练习</p>
      <h1>{lesson.title}</h1>
      <p>
        正在加载本次要练的原谱和跟弹提示。若等待时间过长，可以重新加载本次教材内容。
      </p>
    </div>
  );
}

function SelfDirectedPractice({
  lesson,
  review_note,
  set_review_note,
  on_complete,
  fallback_error,
  on_retry,
  completion_locked = false,
}: {
  lesson: lesson;
  review_note: string;
  set_review_note: (value: string) => void;
  on_complete: () => void;
  fallback_error?: string;
  on_retry?: () => void;
  completion_locked?: boolean;
}) {
  const [is_running, set_is_running] = useState(false);
  const [elapsed_seconds, set_elapsed_seconds] = useState(0);
  const is_sight_reading = lesson.practice_mode === "timed_reading";

  useEffect(() => {
    if (!is_running) {
      return;
    }

    const interval_id = window.setInterval(() => {
      set_elapsed_seconds((value) => value + 1);
    }, 1_000);

    return () => window.clearInterval(interval_id);
  }, [is_running]);

  const instructions = is_sight_reading
    ? [
        "先用 30 秒看调号、拍号、主音、重复音和和弦标记。",
        "以低于正式速度的速度开始，尽量从头到尾不停。",
        "结束后只记录一个最需要改进的问题，再进入下一项。",
      ]
    : [
        "完成纸本条目或热身动作，先确认身体和手腕保持放松。",
        "难处只拆成 2—4 小节，连续正确两遍后再连接。",
        "结束后记录今天最明显的问题，避免下一次重复同一种无效练习。",
      ];

  return (
    <div className="practice-main self-directed-main">
      {fallback_error && on_retry && (
        <section className="guidance-card textbook-fallback-notice" role="status">
          <div>
            <p className="section-kicker"><CircleAlert size={16} /> 跟弹提示暂不可用</p>
            <p>{fallback_error} 可继续按下方谱面手动练习，但本项不会计入课程完成。</p>
          </div>
          <button type="button" className="secondary-button" onClick={on_retry}>
            <RotateCcw size={17} />
            重新加载跟弹提示
          </button>
        </section>
      )}

      <div className="practice-title-row">
        <div>
          <p className="eyebrow">{get_practice_mode_label(lesson.practice_mode)} · {get_material_label(lesson)}</p>
          <h1>{lesson.title}</h1>
          <p className="self-directed-description">{lesson.description}</p>
        </div>
        <div className="self-timer" aria-label="本项计时">
          <TimerReset size={18} />
          <strong>{format_elapsed(elapsed_seconds)}</strong>
        </div>
      </div>

      <PracticeScore
        score={lesson.score}
        favorite_href={`/练习/${lesson.id}`}
        favorite_subtitle={`第 ${lesson.week_number} 周第 ${lesson.day_index} 天 · ${lesson.exercise_type}`}
      />

      <section className="practice-instruction-card">
        <div className="instruction-title">
          {is_sight_reading ? <Clock3 size={20} /> : <ListChecks size={20} />}
          <div>
            <p className="section-kicker">看谱后这样练</p>
            <h2>{lesson.objective}</h2>
          </div>
        </div>
        <ol>
          {instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
        </ol>
      </section>

      <section className="guidance-card">
        <p className="section-kicker">提醒</p>
        <p>{lesson.guidance}</p>
      </section>

      <label className="review-note">
        <span>本次只记录一个问题（可选）</span>
        <textarea
          value={review_note}
          onChange={(event) => set_review_note(event.target.value)}
          placeholder="例如：左手换和弦时总是提前。"
          rows={3}
        />
      </label>

      <div className="practice-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => set_is_running((value) => !value)}
        >
          <TimerReset size={17} />
          {is_running ? "暂停计时" : "开始计时"}
        </button>
        {completion_locked ? (
          <p className="practice-completion-lock">
            教材核验完成后，本项才可计入进度。
          </p>
        ) : (
          <button type="button" className="primary-button" onClick={on_complete}>
            <CheckCircle2 size={17} />
            完成本项
          </button>
        )}
      </div>
    </div>
  );
}

function TempoControl({
  bpm,
  set_bpm,
}: {
  bpm: number;
  set_bpm: (update: (value: number) => number) => void;
}) {
  return (
    <div className="tempo-control" aria-label="速度控制">
      <button
        type="button"
        onClick={() => set_bpm((value) => Math.max(36, value - 4))}
        aria-label="降低速度"
      >
        <ChevronDown size={17} />
      </button>
      <span><strong>{bpm}</strong> BPM</span>
      <button
        type="button"
        onClick={() => set_bpm((value) => Math.min(104, value + 4))}
        aria-label="提高速度"
      >
        <ChevronUp size={17} />
      </button>
    </div>
  );
}

function get_live_accuracy(correct_steps: number, mistakes: number): number {
  const attempts = correct_steps + mistakes;
  return attempts === 0 ? 0 : correct_steps / attempts;
}

function get_hand_label(hand: lesson["hand_mode"]): string {
  if (hand === "both") {
    return "双手";
  }
  return hand === "left" ? "左手" : "右手";
}

function get_material_label(lesson_data: lesson): string {
  const labels: Record<lesson["material_kind"], string> = {
    beyer: "拜厄",
    hanon: "哈农",
    "john-thompson-easiest-1": "小汤 1",
    "john-thompson-easiest-2": "小汤 2",
    warmup: "热身",
    scale: "音阶",
    chord: "和弦",
    piece: "曲目",
    sight_reading: "简谱视奏",
  };
  return labels[lesson_data.material_kind];
}

function get_practice_mode_label(mode: lesson["practice_mode"]): string {
  if (mode === "guided_input") {
    return "MIDI 引导练习";
  }
  return mode === "timed_reading" ? "连续简谱视奏" : "纸本教材与手型练习";
}

function get_midi_button_label(status: string): string {
  if (status === "requesting") {
    return "正在请求 MIDI 权限";
  }
  if (status === "connected") {
    return "重新扫描 MIDI 设备";
  }
  return "连接 MIDI 电钢琴";
}

function get_midi_status_copy(status: string): string {
  if (status === "connected") {
    return "已连接。按下电钢琴的琴键即可获得实时反馈。";
  }
  if (status === "unavailable") {
    return "当前浏览器未开放 Web MIDI，已启用电脑键盘作为后备输入。";
  }
  if (status === "denied") {
    return "MIDI 权限未授予。可以重新连接，或继续使用电脑键盘。";
  }
  return "后备输入：A-S-D-F-G-H-J-K 对应中央 C 到高音 C；Z-X-C-V-B-N-M 对应低八度。";
}

function get_audio_input_status_copy(status: string): string {
  if (status === "requesting") {
    return "正在请求麦克风权限…";
  }
  if (status === "unavailable") {
    return "当前浏览器未开放声音输入接口。";
  }
  if (status === "insecure") {
    return "当前访问地址不是安全上下文，麦克风不可用。请使用 localhost 或 HTTPS 局域网地址。";
  }
  if (status === "denied") {
    return "麦克风权限未授予，请到浏览器设置中允许访问。";
  }
  return "等待声音输入。弹奏单音时会显示检测到的音高。";
}

function format_elapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining_seconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining_seconds).padStart(2, "0")}`;
}

function is_editable_target(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
