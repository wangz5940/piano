import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, FileMusic, LoaderCircle } from "lucide-react";

import { MusicXmlScoreRenderer } from "@/features/assets/MusicXmlScoreRenderer";

interface textbook_score_excerpt_props {
  musicxml_url: string;
  practice_events_url?: string;
  measure_start: number;
  measure_end: number;
  render_measure_start?: number;
  render_measure_end?: number;
  content_sha256?: string;
  excerpt_label?: string;
  show_fingerings: boolean;
  collapse_all_token?: number;
  expand_all_token?: number;
}

type render_state = "loading" | "ready" | "error";

export function TextbookScoreExcerpt({
  musicxml_url,
  practice_events_url,
  render_measure_start,
  render_measure_end,
  excerpt_label,
  show_fingerings,
  collapse_all_token,
  expand_all_token,
}: textbook_score_excerpt_props) {
  const [render_state, set_render_state] = useState<render_state>("loading");
  const [is_expanded, set_is_expanded] = useState(true);

  useEffect(() => {
    if (collapse_all_token !== undefined) {
      set_is_expanded(false);
    }
  }, [collapse_all_token]);

  useEffect(() => {
    if (expand_all_token !== undefined) {
      set_is_expanded(true);
    }
  }, [expand_all_token]);


  return (
    <section
      className="textbook-score-excerpt"
      aria-label={excerpt_label ?? "本次教材原谱片段"}
    >
      <header>
        <div>
          <p className="section-kicker"><FileMusic size={15} /> 本次教材原谱</p>
          <h3>{excerpt_label ?? "本次练习片段"}</h3>
        </div>
        <div className="textbook-score-excerpt-actions">
          <span>本次练习范围</span>
          <button
            type="button"
            className="score-collapse-toggle"
            aria-expanded={is_expanded}
            onClick={() => set_is_expanded((value) => !value)}
          >
            {is_expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {is_expanded ? "收起" : "展开"}
          </button>
        </div>
      </header>
      {is_expanded && (
        <>
          <p className="textbook-score-excerpt-copy">
            {show_fingerings
              ? "先在原谱中看拍号、谱号、调号、左右手、重复音和音符旁的指号；再跟随下方高亮逐拍弹奏。"
              : "先在原谱中看拍号、谱号、调号、左右手和重复音；需要时再打开指法查看手指编号。"}
          </p>
          <div className="textbook-score-excerpt-canvas">
            {render_state === "loading" && (
              <p className="textbook-score-excerpt-loading">
                <LoaderCircle size={17} />
                正在加载本次教材原谱…
              </p>
            )}
            <MusicXmlScoreRenderer
              musicxml_url={musicxml_url}
              practice_events_url={practice_events_url}
              show_fingerings={show_fingerings}
              auto_resize={false}
              draw_measure_numbers
              render_measure_start={render_measure_start}
              render_measure_end={render_measure_end}
              className="textbook-score-excerpt-host"
              on_state_change={set_render_state}
            />
          </div>
          {render_state === "error" && (
            <p className="textbook-score-excerpt-error">
              <CircleAlert size={16} />
              教材原谱暂时未能显示。请先按下方练习谱继续完成本项。
            </p>
          )}
        </>
      )}
    </section>
  );
}
