import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  get_bucketed_jianpu_width,
  layout_render_score,
} from "./layout";
import type {
  jianpu_render_mode,
  jianpu_render_score,
} from "./model";
import { JianpuSvg } from "./JianpuSvg";
import { collect_render_warnings } from "./validate";

import "./jianpuRenderer.css";

const default_ssr_width = 960;
const empty_completed_event_ids = new Set<string>();

export interface jianpu_renderer_props {
  score: jianpu_render_score;
  mode: jianpu_render_mode;
  current_event_id?: string;
  on_event_select?: (event_id: string) => void;
  completed_event_ids?: ReadonlySet<string>;
  show_fingerings?: boolean;
  show_keyboard_aid?: boolean;
  show_final_bar?: boolean;
  width?: number;
  className?: string;
}

export function JianpuRenderer({
  score,
  mode,
  current_event_id,
  on_event_select,
  completed_event_ids = empty_completed_event_ids,
  show_fingerings = false,
  show_keyboard_aid = false,
  show_final_bar = true,
  width,
  className = "",
}: jianpu_renderer_props) {
  const host_ref = useRef<HTMLDivElement>(null);
  const [observed_width, set_observed_width] = useState(default_ssr_width);

  useEffect(() => {
    if (width !== undefined || typeof ResizeObserver === "undefined") {
      return;
    }
    const host = host_ref.current;
    if (!host) {
      return;
    }
    const update_width = (next_width: number) => {
      const bucketed_width = get_bucketed_jianpu_width(next_width);
      set_observed_width((current) =>
        current === bucketed_width ? current : bucketed_width);
    };
    update_width(host.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        update_width(entry.contentRect.width);
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [width]);

  const layout_width = get_bucketed_jianpu_width(width ?? observed_width);
  const layout = useMemo(
    () => layout_render_score(score, {
      container_width: layout_width,
      mode,
    }),
    [layout_width, mode, score],
  );
  const warnings = useMemo(() => collect_render_warnings(score), [score]);
  const view_state = useMemo(() => ({
    mode,
    current_event_id,
    on_event_select,
    completed_event_ids,
    show_fingerings,
    show_keyboard_aid,
  }), [
    completed_event_ids,
    current_event_id,
    mode,
    on_event_select,
    show_fingerings,
    show_keyboard_aid,
  ]);
  const hand_label = get_score_hand_label(score);

  return (
    <div
      ref={host_ref}
      className={`jianpu-renderer mode-${mode} ${className}`.trim()}
      data-jianpu-score={score.id}
      data-key-signature={score.key_signature}
      data-time-signature={score.time_signature}
      data-system-count={layout.systems.length}
      data-warning-count={warnings.length}
      data-warning-codes={Array.from(
        new Set(warnings.map((warning) => warning.code)),
      ).join(",") || undefined}
      aria-label={`${score.title ?? "简谱"}，${hand_label}`}
    >
      <p className="jianpu-renderer-sr-only">
        {score.key_signature}，{score.time_signature}，{hand_label}，
        共 {score.measures.length} 小节。
      </p>
      <div className="jianpu-renderer-signature" aria-hidden="true">
        <span>{score.key_signature}</span>
        <span>{score.time_signature}</span>
      </div>
      {warnings.length > 0 && (
        <p className="jianpu-renderer-sr-only">
          谱面包含 {warnings.length} 项数据校验提示，已完整显示可用内容。
        </p>
      )}
      <div className="jianpu-renderer-systems">
        {layout.systems.map((system) => (
          <div
            key={system.index}
            className="jianpu-renderer-system"
            data-system-warning-count={system.warnings.length}
          >
            <JianpuSvg
              system={system}
              score_title={score.title}
              show_final_bar={show_final_bar}
              view_state={view_state}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function get_score_hand_label(score: jianpu_render_score): string {
  const has_right_hand = score.measures.some((measure) => measure.right.length > 0);
  const has_left_hand = score.measures.some((measure) => measure.left.length > 0);
  if (has_right_hand && has_left_hand) {
    return "双手谱";
  }
  return has_left_hand ? "左手谱" : "右手谱";
}
