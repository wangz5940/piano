import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  ChevronDown,
  ChevronUp,
  Hand,
  Heart,
  Keyboard,
  Music2,
  Rows3,
  Timer,
} from "lucide-react";

import type { expected_step, practice_score } from "@/features/course/types";
import type { note_fingering } from "@/features/course/types";
import { TextbookScoreExcerpt } from "@/components/TextbookScoreExcerpt";
import { parse_time_signature } from "@/components/scoreTimeSignature";
import { load_material_catalog } from "@/features/assets/loadCatalog";
import { get_step_hand_fingerings } from "@/features/course/fingerings";
import { note_name } from "@/features/course/scoreBuilders";
import {
  JianpuRenderer,
  StaffAidRenderer,
  to_render_score_from_practice_score,
  to_render_score_from_score_document,
} from "@/features/jianpu/render";
import type { score_document_v2 } from "@/features/score";
import { use_app_settings_store } from "@/store/useAppSettingsStore";
import {
  is_score_favorite,
  load_score_favorites,
  save_score_favorites,
  toggle_score_favorite,
} from "@/features/repertoire/favorites";
import {
  apply_material_review_record,
  get_material_review_record,
  load_material_review_records,
  material_review_change_event,
} from "@/features/assets/reviewGate";

type notation_view = "jianpu" | "staff";

interface practice_score_props {
  score: practice_score;
  current_step_index?: number;
  compact?: boolean;
  favorite_href?: string;
  favorite_subtitle?: string;
  collapse_all_token?: number;
  expand_all_token?: number;
}

interface score_event {
  step: expected_step;
  source_index: number;
  right_notes: number[];
  left_notes: number[];
  right_fingerings: Array<note_fingering | undefined>;
  left_fingerings: Array<note_fingering | undefined>;
}

interface score_measure {
  index: number;
  beats_per_measure: number;
  events: score_event[];
  chord_label?: string;
  hand_position?: {
    label: string;
    notes: string[];
    fingers: string[];
    movement: "stay" | "move" | "return";
    reason: string;
  };
}

type practice_score_with_optional_score_document = practice_score & {
  score_document?: score_document_v2;
};

export function PracticeScore({
  score,
  current_step_index,
  compact = false,
  favorite_href,
  favorite_subtitle,
  collapse_all_token,
  expand_all_token,
}: practice_score_props) {
  const [notation_view, set_notation_view] = useState<notation_view>("jianpu");
  const [show_keyboard_aid, set_show_keyboard_aid] = useState(false);
  const [is_expanded, set_is_expanded] = useState(true);
  const [favorite_entries, set_favorite_entries] = useState(load_score_favorites);
  const show_fingerings = use_app_settings_store((state) => state.show_fingerings);
  const set_show_fingerings = use_app_settings_store((state) => state.set_show_fingerings);
  const score_document = useMemo(() => get_score_document(score), [score]);
  const measures = useMemo(
    () => group_steps_by_measure(
      score.steps,
      score.beats_per_measure,
      score.source.kind === "musicxml",
      score.measure_beats,
      score.finger_guide.position_map,
    ),
    [score],
  );
  const jianpu_score = useMemo(
    () => score_document
      ? to_render_score_from_score_document(score_document)
      : to_render_score_from_practice_score(score),
    [score, score_document],
  );
  const current_event_id = current_step_index === undefined
    ? undefined
    : score.steps[current_step_index]?.id;
  const completed_event_ids = useMemo(
    () => new Set(
      current_step_index === undefined
        ? []
        : score.steps.slice(0, current_step_index).map((step) => step.id),
    ),
    [current_step_index, score.steps],
  );
  const source_status = useEffectiveSourceStatus(score.source);
  const textbook_excerpts = get_textbook_excerpts(score);
  const has_steps = score.steps.length > 0;
  const favorite_id = `practice:${score.id}`;
  const is_favorite = is_score_favorite(favorite_entries, favorite_id);

  useEffect(() => {
    save_score_favorites(favorite_entries);
  }, [favorite_entries]);

  useEffect(() => {
    if (collapse_all_token === undefined) {
      return;
    }
    set_is_expanded(false);
  }, [collapse_all_token]);

  useEffect(() => {
    if (expand_all_token === undefined) {
      return;
    }
    set_is_expanded(true);
  }, [expand_all_token]);

  return (
    <section className={`practice-score ${compact ? "is-compact" : ""}`} aria-label={`${score.title}练习谱`}>
      <div className="practice-score-head">
        <div>
          <p className="section-kicker"><Music2 size={15} /> 练习谱</p>
          <h2>{score.title}</h2>
        </div>
        <div className="practice-score-head-actions">
          <span className={`score-source status-${source_status}`}>{get_source_status_label(score.source.kind, source_status)}</span>
          {favorite_href && (
            <button
              type="button"
              className={`repertoire-favorite-toggle ${is_favorite ? "is-favorite" : ""}`}
              aria-pressed={is_favorite}
              aria-label={is_favorite ? `取消收藏${score.title}` : `收藏${score.title}`}
              onClick={() => set_favorite_entries((entries) =>
                toggle_score_favorite(entries, {
                  id: favorite_id,
                  kind: "practice",
                  title: score.title,
                  subtitle: favorite_subtitle ?? `${score.key_signature} · ${score.time_signature}`,
                  href: favorite_href,
                  source: score.source.label,
                }))}
            >
              <Heart size={16} fill={is_favorite ? "currentColor" : "none"} />
            </button>
          )}
          <button
            type="button"
            className="score-collapse-toggle"
            aria-expanded={is_expanded}
            onClick={() => set_is_expanded((value) => !value)}
          >
            {is_expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {is_expanded ? "收起谱面" : "展开谱面"}
          </button>
        </div>
      </div>

      {is_expanded && (
        <>
          <div className="score-meta">
            <span>{score.key_signature}</span>
            <span>{score.time_signature}</span>
            <span><Timer size={13} /> {score.tempo_hint}</span>
          </div>

          {textbook_excerpts.map((excerpt) => (
            <TextbookScoreExcerpt
              key={`${excerpt.asset_id}-${excerpt.measure_start}-${excerpt.measure_end}`}
              musicxml_url={excerpt.musicxml_url}
              practice_events_url={excerpt.practice_events_url}
              measure_start={excerpt.measure_start}
              measure_end={excerpt.measure_end}
              render_measure_start={excerpt.render_measure_start}
              render_measure_end={excerpt.render_measure_end}
              content_sha256={excerpt.content_sha256}
              excerpt_label={excerpt.label}
              show_fingerings={show_fingerings}
              collapse_all_token={collapse_all_token}
              expand_all_token={expand_all_token}
            />
          ))}

          {has_steps ? (
            <>
              <div className="score-view-toolbar" role="group" aria-label="乐谱显示控制">
                <div className="notation-view-switch">
                  <button
                    type="button"
                    className={notation_view === "jianpu" ? "is-selected" : ""}
                    aria-pressed={notation_view === "jianpu"}
                    onClick={() => set_notation_view("jianpu")}
                  >
                    简谱
                  </button>
                  <button
                    type="button"
                    className={notation_view === "staff" ? "is-selected" : ""}
                    aria-pressed={notation_view === "staff"}
                    onClick={() => set_notation_view("staff")}
                  >
                    五线谱
                  </button>
                </div>
                <div className="score-view-toolbar-actions">
                  <button
                    type="button"
                    className={`score-option-toggle ${show_fingerings ? "is-selected" : ""}`}
                    aria-pressed={show_fingerings}
                    onClick={() => set_show_fingerings(!show_fingerings)}
                  >
                    <Hand size={14} />
                    {show_fingerings ? "隐藏指法" : "显示指法"}
                  </button>
                  <button
                    type="button"
                    className={`score-option-toggle ${show_keyboard_aid ? "is-selected" : ""}`}
                    aria-pressed={show_keyboard_aid}
                    onClick={() => set_show_keyboard_aid((value) => !value)}
                  >
                    <Keyboard size={14} />
                    键位辅助
                  </button>
                </div>
              </div>

              {notation_view === "jianpu" ? (
                <JianpuRenderer
                  score={jianpu_score}
                  mode="practice"
                  current_event_id={current_event_id}
                  completed_event_ids={completed_event_ids}
                  show_keyboard_aid={show_keyboard_aid}
                  show_fingerings={show_fingerings}
                />
              ) : (
                score_document
                  ? (
                    <StaffAidRenderer
                      score={jianpu_score}
                      show_fingerings={show_fingerings}
                    />
                  )
                  : (
                    <StaffScore
                      measures={measures}
                      time_signature={score.time_signature}
                      beats_per_measure={score.beats_per_measure}
                      current_step_index={current_step_index}
                      show_fingerings={show_fingerings}
                    />
                  )
              )}
            </>
          ) : (
            <ScorePendingSourceState score={score} />
          )}

          {!compact && (
            <>
              <div className="score-practice-map">
                <div>
                  <Hand size={16} />
                  <span>起始手位</span>
                  <p>{score.start_position}</p>
                </div>
                <div>
                  <BookOpenText size={16} />
                  <span>指法提示</span>
                  <p>{score.finger_hint}</p>
                </div>
              </div>
              <FingeringGuide
                score={score}
                collapse_all_token={collapse_all_token}
                expand_all_token={expand_all_token}
              />
            </>
          )}

          <p className="score-source-copy">谱面来源：{score.source.label}</p>
        </>
      )}
    </section>
  );
}

function get_score_document(score: practice_score): score_document_v2 | undefined {
  const candidate = (score as practice_score_with_optional_score_document).score_document;
  return candidate?.schema_version === 2 && candidate.status === "published"
    ? candidate
    : undefined;
}

function ScorePendingSourceState({ score }: { score: practice_score }) {
  return (
    <section className="score-pending-source" aria-label="谱面待审核">
      <div>
        <p className="section-kicker"><Rows3 size={15} /> PPTX OOXML 来源已接入</p>
        <h3>这首诗歌还没有已发布的可跟弹谱。</h3>
        <p>
          当前只保留来源结构、歌词和质量状态，等待人工校对生成
          ScoreDocument v2 后再进入实时判定。
        </p>
      </div>
      <dl>
        <div>
          <dt>来源</dt>
          <dd>{score.source.label}</dd>
        </div>
        {score.source.content_sha256 && (
          <div>
            <dt>SHA-256</dt>
            <dd>{score.source.content_sha256}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function FingeringGuide({
  score,
  collapse_all_token,
  expand_all_token,
}: {
  score: practice_score;
  collapse_all_token?: number;
  expand_all_token?: number;
}) {
  const guide = score.finger_guide;
  const [is_open, set_is_open] = useState(true);

  useEffect(() => {
    if (collapse_all_token !== undefined) {
      set_is_open(false);
    }
  }, [collapse_all_token]);

  useEffect(() => {
    if (expand_all_token !== undefined) {
      set_is_open(true);
    }
  }, [expand_all_token]);

  return (
    <details className="fingering-guide" open={is_open} onToggle={(event) => set_is_open(event.currentTarget.open)}>
      <summary>
        <span>
          <Hand size={17} />
          本课手位、指法与和弦分析
        </span>
        <small>根据当前谱面解释为什么这样弹</small>
      </summary>
      <div className="fingering-guide-grid">
        <section>
          <h3>1. 本课先判断什么</h3>
          <ol>
            {build_score_entry_analysis(score).map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
        <section className="fingering-reasoning-panel">
          <h3>2. 手位为什么这样放</h3>
          {guide.position_map.length > 0 && (
            <div className="hand-position-map">
              {guide.position_map.map((position) => (
                <article
                  key={`${position.label}-${position.applies_to}`}
                  className={`hand-position-card is-${position.movement ?? "stay"}`}
                >
                  <strong>{position.label}</strong>
                  <p>{position.applies_to}</p>
                  <code>{position.notes.join(" · ")}</code>
                  <small>手指：{position.fingers.join(" ")}</small>
                  <span>{position.reason}</span>
                </article>
              ))}
            </div>
          )}
          <ol>
            {guide.position_strategy.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
        <section>
          <h3>3. 逐音指法为什么这样</h3>
          <ol>
            {build_note_fingering_analysis(score).map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
        <section>
          <h3>4. 左手和弦为什么这样</h3>
          <ol>
            {build_left_hand_chord_analysis(score).map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
        <section>
          <h3>5. 本课自查</h3>
          <ol>
            {guide.self_check.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
      </div>
    </details>
  );
}

function build_score_entry_analysis(score: practice_score): string[] {
  return [
    `本课谱面是《${score.title}》，${score.key_signature}，${score.time_signature}。先用调性决定 1 指附近的主音，再看本课最高音和最低音。`,
    `起始手位：${score.start_position}`,
    `本课开头指法：${score.finger_hint}`,
  ];
}

function build_note_fingering_analysis(score: practice_score): string[] {
  const right_events = score.steps
    .flatMap((step) => {
      const right_fingerings = (step.fingerings ?? [])
        .filter((fingering) => fingering.hand === "right");
      return right_fingerings.map((fingering) => ({
        step,
        fingering,
      }));
    })
    .slice(0, 8);

  if (right_events.length === 0) {
    return ["本课没有右手逐音指法；先按谱面手别确认左手或双手动作。"];
  }

  return right_events.map(({ step, fingering }) => {
    const beat = (step.beat_in_measure ?? step.beat_index % score.beats_per_measure) + 1;
    const note = note_name(fingering.note);
    return `第 ${step.measure_index} 小节第 ${format_beat(beat)} 拍：${note} 用右手 ${fingering.finger} 指。理由：${describe_right_fingering_reason(score, fingering.note, fingering.finger)}`;
  });
}

function describe_right_fingering_reason(
  score: practice_score,
  note: number,
  finger: note_fingering["finger"],
): string {
  const current_note = note_name(note);
  const position = score.finger_guide.position_map.find((item) =>
    item.notes.includes(current_note),
  );

  if (!position) {
    return `${current_note} 超出当前手位地图，先检查旋律是否已经离开五指位置，再决定移动手位或临时伸展。`;
  }

  const index = position.notes.indexOf(current_note);
  const mapped_finger = position.fingers[index];
  if (mapped_finger === String(finger)) {
    return `${current_note} 在 ${position.label} 中是第 ${index + 1} 个音，所以自然对应 ${finger} 指。`;
  }

  return `${current_note} 落在 ${position.label}，但本课实际用 ${finger} 指，说明这里要按上下文预留手指或连接下一拍，不是机械套固定数字。`;
}

function build_left_hand_chord_analysis(score: practice_score): string[] {
  const chord_progression = get_chord_progression(score);
  const left_events = score.steps
    .filter((step) => (step.fingerings ?? []).some((fingering) => fingering.hand === "left"))
    .filter((step, index, steps) =>
      steps.findIndex((item) => item.measure_index === step.measure_index) === index,
    )
    .slice(0, 4);

  if (left_events.length === 0) {
    const progression = chord_progression.length > 0
      ? chord_progression.join(" → ")
      : "本课标记的和弦";
    return [
      `当前谱面以右手旋律为主，左手先预备 ${progression}，暂时不把左手加入实时判定。`,
      "这样设计是为了先稳定右手手位；等旋律不断后，再把左手根音或和弦形状加进去。",
    ];
  }

  return left_events.map((step) => {
    const left_fingerings = (step.fingerings ?? [])
      .filter((fingering) => fingering.hand === "left")
      .sort((a, b) => a.note - b.note);
    const note_labels = left_fingerings.map((fingering) => note_name(fingering.note));
    const fingers = left_fingerings.map((fingering) => fingering.finger);
    const chord = chord_progression[(step.measure_index - 1) % chord_progression.length];
    const chord_label = chord ? `，对应 ${chord} 和弦` : "";
    if (left_fingerings.length === 1) {
      return `第 ${step.measure_index} 小节左手 ${note_labels[0]} 用 ${fingers[0]} 指${chord_label}的根音支撑。先弹根音，是为了不让左手复杂度打断右手旋律。`;
    }
    return `第 ${step.measure_index} 小节左手 ${note_labels.join("-")} 用 ${fingers.join("-")} 指${chord_label}的和弦形状。先整体摆好形状，再和右手拍点对齐。`;
  });
}

function get_chord_progression(score: practice_score): string[] {
  const match = /左手准备\s(.+?)\s*的/.exec(score.start_position);
  if (!match) {
    return [];
  }
  return match[1]
    .split("→")
    .map((item) => item.trim())
    .filter(Boolean);
}

function format_beat(beat: number): string {
  return Number.isInteger(beat) ? String(beat) : beat.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function get_textbook_excerpts(score: practice_score): Array<{
  asset_id: string;
  label: string;
  musicxml_url: string;
  practice_events_url?: string;
  measure_start: number;
  measure_end: number;
  render_measure_start?: number;
  render_measure_end?: number;
  content_sha256?: string;
}> {
  if (score.source.kind !== "musicxml") {
    return [];
  }

  const resolved_excerpts = score.source.excerpts
    ?.filter((excerpt) => Boolean(excerpt.musicxml_url))
    .map((excerpt) => ({
      asset_id: excerpt.asset_id,
      label: excerpt.label,
      musicxml_url: excerpt.musicxml_url!,
      practice_events_url: excerpt.practice_events_url,
      measure_start: excerpt.measure_start ?? 1,
      measure_end: excerpt.measure_end ?? excerpt.measure_start ?? 1,
      render_measure_start: excerpt.render_measure_start,
      render_measure_end: excerpt.render_measure_end,
      content_sha256: excerpt.content_sha256,
    }));
  if (resolved_excerpts?.length) {
    return resolved_excerpts;
  }
  if (!score.source.musicxml_url) {
    return [];
  }

  return [{
    asset_id: score.source.asset_id ?? score.id,
    label: score.source.excerpt_label ?? score.source.label,
    musicxml_url: score.source.musicxml_url,
    practice_events_url: score.source.practice_events_url,
    measure_start: score.source.measure_start ?? 1,
    measure_end: score.source.measure_end ?? score.source.measure_start ?? 1,
    render_measure_start: score.source.render_measure_start,
    render_measure_end: score.source.render_measure_end,
    content_sha256: score.source.content_sha256,
  }];
}

function StaffScore({
  measures,
  time_signature,
  beats_per_measure,
  current_step_index,
  show_fingerings,
}: {
  measures: score_measure[];
  time_signature: string;
  beats_per_measure: number;
  current_step_index?: number;
  show_fingerings: boolean;
}) {
  const [display_beats, display_beat_type] = parse_time_signature(
    time_signature,
    beats_per_measure,
  );
  const measures_per_system = 4;
  const system_count = Math.ceil(measures.length / measures_per_system);
  const has_right_hand = measures.some((measure) =>
    measure.events.some((event) => event.right_notes.length > 0),
  );
  const has_left_hand = measures.some((measure) =>
    measure.events.some((event) => event.left_notes.length > 0),
  );
  const has_two_hands = has_right_hand && has_left_hand;
  const measure_width = 176;
  const left_margin = 76;
  const width = left_margin + Math.min(measures.length, measures_per_system) * measure_width + 16;
  const system_height = has_two_hands ? 176 : 102;
  const height = system_count * system_height + 16;

  return (
    <div className="staff-score-wrap" aria-label="五线谱辅助">
      <svg
        className="staff-score"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="由当前练习数据生成的五线谱辅助视图"
      >
        {Array.from({ length: system_count }, (_, system_index) => {
          const system_measures = measures.slice(
            system_index * measures_per_system,
            (system_index + 1) * measures_per_system,
          );
          const top = system_index * system_height + 10;

          return (
            <g key={system_index}>
              {has_right_hand && (
                <>
                  <StaffLines top={top} left={left_margin} width={system_measures.length * measure_width} />
                  <text className="staff-clef" x="16" y={top + 39}>𝄞</text>
                </>
              )}
              {has_left_hand && (
                <>
                  <StaffLines
                    top={top + (has_right_hand ? 74 : 0)}
                    left={left_margin}
                    width={system_measures.length * measure_width}
                  />
                  <text
                    className="staff-clef staff-bass-clef"
                    x="22"
                    y={top + (has_right_hand ? 109 : 35)}
                  >
                    𝄢
                  </text>
                </>
              )}
              {system_index === 0 && (
                <text className="staff-time-signature" x="56" y={top + 34}>
                  {display_beats}
                  <tspan x="56" dy="17">{display_beat_type}</tspan>
                </text>
              )}
              {system_measures.map((measure, measure_offset) => {
                const x = left_margin + measure_offset * measure_width;
                return (
                  <StaffMeasure
                    key={measure.index}
                    measure={measure}
                    x={x}
                    top={top}
                    width={measure_width}
                    beats_per_measure={measure.beats_per_measure}
                    right_top={has_right_hand ? top : undefined}
                    left_top={has_left_hand ? top + (has_right_hand ? 74 : 0) : undefined}
                    barline_height={has_two_hands ? 114 : 40}
                    current_step_index={current_step_index}
                    is_last={measure_offset === system_measures.length - 1}
                    show_fingerings={show_fingerings}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="staff-score-note">
        <Rows3 size={14} />
        用五线谱确认音高、谱表与当前手位，再按本次练习顺序连续弹奏。
      </p>
    </div>
  );
}

function StaffLines({ top, left, width }: { top: number; left: number; width: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <line
          key={index}
          className="staff-line"
          x1={left}
          y1={top + index * 10}
          x2={left + width}
          y2={top + index * 10}
        />
      ))}
    </>
  );
}

function StaffMeasure({
  measure,
  x,
  top,
  width,
  beats_per_measure,
  right_top,
  left_top,
  barline_height,
  current_step_index,
  is_last,
  show_fingerings,
}: {
  measure: score_measure;
  x: number;
  top: number;
  width: number;
  beats_per_measure: number;
  right_top?: number;
  left_top?: number;
  barline_height: number;
  current_step_index?: number;
  is_last: boolean;
  show_fingerings: boolean;
}) {
  const position_y = Math.max(0, top - 10);
  return (
    <g>
      {measure.hand_position && (
        <g className={`staff-position-band is-${measure.hand_position.movement}`}>
          <title>{measure.hand_position.reason}</title>
          <rect x={x + 4} y={position_y} width={width - 8} height="17" rx="6" />
          <text className="staff-position-label" x={x + 9} y={position_y + 12}>
            {format_staff_position_label(measure.hand_position.label, measure.hand_position.movement)}
          </text>
          <text className="staff-position-map" x={x + width - 8} y={position_y + 12}>
            {measure.hand_position.notes.join(" ")} / {measure.hand_position.fingers.join("")}
          </text>
        </g>
      )}
      <line className="staff-barline" x1={x} y1={top} x2={x} y2={top + barline_height} />
      {is_last && <line className="staff-barline is-final" x1={x + width} y1={top} x2={x + width} y2={top + barline_height} />}
      {measure.chord_label && (
        <text className="staff-chord-label" x={x + 8} y={measure.hand_position ? top + 25 : top - 7}>{measure.chord_label}</text>
      )}
      {measure.events.map((event) => {
        const offset = event.step.beat_in_measure ?? event.step.beat_index % beats_per_measure;
        const note_x = x + 20 + (offset / beats_per_measure) * (width - 32);
        const is_current = event.source_index === current_step_index;
        const is_done = current_step_index !== undefined && event.source_index < current_step_index;

        return (
          <g key={event.step.id} className={`${is_current ? "is-current" : ""} ${is_done ? "is-done" : ""}`}>
            {right_top !== undefined && (
              <StaffNoteGroup
                notes={event.right_notes}
                fingerings={event.right_fingerings}
                x={note_x}
                top={right_top}
                staff="treble"
                show_fingerings={show_fingerings}
              />
            )}
            {left_top !== undefined && (
              <StaffNoteGroup
                notes={event.left_notes}
                fingerings={event.left_fingerings}
                x={note_x}
                top={left_top}
                staff="bass"
                show_fingerings={show_fingerings}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function format_staff_position_label(
  label: string,
  movement: "stay" | "move" | "return",
): string {
  if (movement === "move") {
    return label.startsWith("Move to ") ? label : `Move to ${label}`;
  }
  if (movement === "return") {
    return label.startsWith("Return to ") ? label : `Return to ${label}`;
  }
  return label;
}

function StaffNoteGroup({
  notes,
  fingerings,
  x,
  top,
  staff,
  show_fingerings,
}: {
  notes: number[];
  fingerings: Array<note_fingering | undefined>;
  x: number;
  top: number;
  staff: "treble" | "bass";
  show_fingerings: boolean;
}) {
  if (notes.length === 0) {
    return null;
  }

  const ys = notes.map((note) => staff_y(note, top, staff));
  const stem_y = Math.min(...ys);
  const fingering_y = staff === "treble"
    ? Math.min(...ys) - 13
    : Math.max(...ys) + 19;
  const fingering_digits = format_fingering_digits(fingerings);

  return (
    <g className="staff-note-group">
      {show_fingerings && fingering_digits && (
        <text className="staff-fingering" x={x} y={fingering_y}>
          {fingering_digits}
        </text>
      )}
      {notes.flatMap((note) => ledger_lines(note, top, staff).map((y) => (
        <line key={`${note}-${y}`} className="staff-ledger-line" x1={x - 7} y1={y} x2={x + 7} y2={y} />
      )))}
      <line className="staff-stem" x1={x + 4} y1={stem_y} x2={x + 4} y2={stem_y - 31} />
      {ys.map((y, index) => (
        <ellipse
          key={`${notes[index]}-${index}`}
          className="staff-notehead"
          cx={x}
          cy={y}
          rx="5.2"
          ry="3.7"
          transform={`rotate(-20 ${x} ${y})`}
        />
      ))}
    </g>
  );
}

function group_steps_by_measure(
  steps: expected_step[],
  beats_per_measure: number,
  use_explicit_measure_index: boolean,
  measure_beats?: number[],
  position_map: practice_score["finger_guide"]["position_map"] = [],
): score_measure[] {
  const groups = new Map<number, score_event[]>();
  const should_use_measure_index = use_explicit_measure_index || measure_beats !== undefined;
  const first_measure_index = should_use_measure_index
    ? Math.min(...steps.map((step) => step.measure_index))
    : 1;

  steps.forEach((step, source_index) => {
    const measure_index = should_use_measure_index
      ? step.measure_index - first_measure_index
      : Math.floor(step.beat_index / beats_per_measure);
    const events = groups.get(measure_index) ?? [];
    const split = split_hand_notes(step);

    events.push({
      step,
      source_index,
      right_notes: split.right_notes,
      left_notes: split.left_notes,
      right_fingerings: get_step_hand_fingerings(step, "right", split.right_notes),
      left_fingerings: get_step_hand_fingerings(step, "left", split.left_notes),
    });
    groups.set(measure_index, events);
  });

  const measures = Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([index, events]) => ({
      index,
      beats_per_measure: measure_beats?.[index] ?? beats_per_measure,
      events,
      chord_label: events
        .map((event) => get_chord_label(event.step))
        .find((label): label is string => Boolean(label)),
    }));
  return measures.map((measure, index) => {
    const selected = select_measure_position(measure.events, position_map);
    const previous = index > 0
      ? select_measure_position(measures[index - 1].events, position_map)
      : undefined;
    return {
      ...measure,
      hand_position: selected
        ? {
            label: selected.label,
            notes: selected.notes,
            fingers: selected.fingers,
            reason: selected.reason,
            movement: get_staff_position_movement(position_map, selected.label, previous?.label),
          }
        : undefined,
    };
  });
}

function select_measure_position(
  events: score_event[],
  position_map: practice_score["finger_guide"]["position_map"],
): practice_score["finger_guide"]["position_map"][number] | undefined {
  if (position_map.length === 0) {
    return undefined;
  }
  const right_notes = events.flatMap((event) => event.right_notes);
  return select_position_for_notes(position_map, right_notes);
}

function select_position_for_notes(
  position_map: practice_score["finger_guide"]["position_map"],
  notes: number[],
): practice_score["finger_guide"]["position_map"][number] {
  const note_names = notes.map(note_name);
  const primary = position_map[0];
  const has_note_outside_primary = note_names.some((name) =>
    !primary.notes.includes(name));
  if (has_note_outside_primary) {
    const shifted = position_map.slice(1).find((position) =>
      note_names.some((name) => position.notes.includes(name)));
    if (shifted) {
      return shifted;
    }
  }
  return position_map.find((position) =>
    note_names.some((name) => position.notes.includes(name))) ??
    primary;
}

function get_staff_position_movement(
  position_map: practice_score["finger_guide"]["position_map"],
  label: string,
  previous_label: string | undefined,
): "stay" | "move" | "return" {
  if (!previous_label) {
    return label === position_map[0]?.label ? "stay" : "move";
  }
  if (previous_label === label) {
    return "stay";
  }
  return label === position_map[0]?.label ? "return" : "move";
}

function format_fingering_digits(
  fingerings: Array<note_fingering | undefined>,
): string {
  return fingerings
    .map((fingering) => fingering?.finger)
    .filter((finger): finger is note_fingering["finger"] => Boolean(finger))
    .join("-");
}

function split_hand_notes(step: expected_step): { right_notes: number[]; left_notes: number[] } {
  if (step.hand === "right") {
    return { right_notes: step.notes, left_notes: [] };
  }
  if (step.hand === "left") {
    return { right_notes: [], left_notes: step.notes };
  }
  if (step.fingerings?.length === step.notes.length) {
    return {
      right_notes: step.fingerings
        .filter((fingering) => fingering.hand === "right")
        .map((fingering) => fingering.note),
      left_notes: step.fingerings
        .filter((fingering) => fingering.hand === "left")
        .map((fingering) => fingering.note),
    };
  }

  const sorted_notes = [...step.notes].sort((left, right) => left - right);
  return {
    right_notes: sorted_notes.length > 0 ? [sorted_notes.at(-1)!] : [],
    left_notes: sorted_notes.slice(0, -1),
  };
}

function get_chord_label(step: expected_step): string | undefined {
  if (step.notes.length < 2) {
    return undefined;
  }

  const match = step.notation.match(/左\s+([A-G](?:\s*低音)?)|^([A-G])(?:\s|$)/);
  return match?.[1]?.replace(" 低音", "") ?? match?.[2];
}

function staff_y(midi: number, top: number, staff: "treble" | "bass"): number {
  const diatonic = diatonic_index(midi);
  const baseline = staff === "treble" ? diatonic_index(64) : diatonic_index(40);
  return top + 40 - (diatonic - baseline) * 5;
}

function ledger_lines(midi: number, top: number, staff: "treble" | "bass"): number[] {
  const y = staff_y(midi, top, staff);
  const staff_bottom = top + 40;
  const lines: number[] = [];

  if (y < top) {
    for (let line = top - 10; line >= y; line -= 10) {
      lines.push(line);
    }
  } else if (y > staff_bottom) {
    for (let line = staff_bottom + 10; line <= y; line += 10) {
      lines.push(line);
    }
  }

  return lines;
}

function diatonic_index(midi: number): number {
  const names = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return (Math.floor(midi / 12) - 1) * 7 + names[midi % 12];
}

function useEffectiveSourceStatus(
  source: practice_score["source"],
): practice_score["source"]["status"] {
  const [status, set_status] = useState(source.status);

  useEffect(() => {
    let active = true;

    if (source.kind !== "musicxml" || !source.asset_id) {
      set_status(source.status);
      return () => {
        active = false;
      };
    }

    const refresh_status = async () => {
      try {
        const catalog = await load_material_catalog();
        const segment = catalog.materials
          .flatMap((material) => material.segments)
          .find((item) => item.id === source.asset_id);
        if (!active) {
          return;
        }
        if (!segment) {
          set_status(source.status);
          return;
        }

        const record = get_material_review_record(load_material_review_records(), segment);
        set_status(apply_material_review_record(segment, record).status);
      } catch {
        if (active) {
          set_status(source.status);
        }
      }
    };

    void refresh_status();
    window.addEventListener(material_review_change_event, refresh_status);

    return () => {
      active = false;
      window.removeEventListener(material_review_change_event, refresh_status);
    };
  }, [source]);

  return status;
}

function get_source_status_label(
  kind: practice_score["source"]["kind"],
  status: practice_score["source"]["status"],
): string {
  if (status === "published") {
    return kind === "musicxml" ? "教材原谱" : "可交互谱";
  }
  if (status === "verified") {
    return "已核对";
  }
  if (status === "validation_failed") {
    return "暂不可用";
  }
  if (status === "rejected") {
    return "暂不可用";
  }
  if (status === "candidate") {
    return "待核对谱";
  }
  if (status === "reference_only") {
    return "原谱对照";
  }
  if (status === "awaiting_import") {
    return "待接入原谱";
  }
  return "待人工核对";
}
