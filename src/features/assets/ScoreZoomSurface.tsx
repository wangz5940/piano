import { useCallback, useRef, useState } from "react";
import type { CSSProperties, ReactNode, TouchEvent, WheelEvent } from "react";
import { Minus, Plus } from "lucide-react";

const minimum_score_zoom = 0.72;
const maximum_score_zoom = 1.5;
const score_zoom_step = 0.08;

interface score_zoom_surface_props {
  children: ReactNode;
  measure_start: number;
  measure_end: number;
  className?: string;
}

export function ScoreZoomSurface({
  children,
  measure_start,
  measure_end,
  className = "",
}: score_zoom_surface_props) {
  const [zoom, set_zoom] = useState(1);
  const pinch_distance_ref = useRef<number>();
  const update_zoom = useCallback((next_zoom: number) => {
    set_zoom(Math.min(maximum_score_zoom, Math.max(minimum_score_zoom, next_zoom)));
  }, []);
  const change_zoom = useCallback((direction: number) => {
    set_zoom((current) =>
      Math.min(
        maximum_score_zoom,
        Math.max(minimum_score_zoom, current + direction * score_zoom_step),
      ));
  }, []);
  const handle_wheel = useCallback((event: WheelEvent<HTMLElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    change_zoom(event.deltaY > 0 ? -1 : 1);
  }, [change_zoom]);
  const handle_touch_start = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length === 2) {
      pinch_distance_ref.current = get_touch_distance(event.touches);
    }
  }, []);
  const handle_touch_move = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 2 || pinch_distance_ref.current === undefined) {
      return;
    }
    const next_distance = get_touch_distance(event.touches);
    const delta = next_distance - pinch_distance_ref.current;
    if (Math.abs(delta) < 8) {
      return;
    }
    event.preventDefault();
    change_zoom(delta > 0 ? 1 : -1);
    pinch_distance_ref.current = next_distance;
  }, [change_zoom]);
  const handle_touch_end = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length < 2) {
      pinch_distance_ref.current = undefined;
    }
  }, []);
  const zoom_percent = Math.round(zoom * 100);

  return (
    <section
      className={`score-zoom-surface ${className}`.trim()}
      style={{ "--score-zoom": String(zoom) } as CSSProperties}
      onWheel={handle_wheel}
      onTouchStart={handle_touch_start}
      onTouchMove={handle_touch_move}
      onTouchEnd={handle_touch_end}
    >
      <header className="score-zoom-toolbar">
        <span>第 {measure_start}-{measure_end} 小节</span>
        <div className="score-zoom-controls" aria-label="谱面缩放">
          <button
            type="button"
            aria-label="缩小谱面"
            onClick={() => change_zoom(-1)}
          >
            <Minus size={14} />
          </button>
          <input
            type="range"
            min={Math.round(minimum_score_zoom * 100)}
            max={Math.round(maximum_score_zoom * 100)}
            step={Math.round(score_zoom_step * 100)}
            value={zoom_percent}
            aria-label="谱面缩放比例"
            onChange={(event) => update_zoom(Number(event.target.value) / 100)}
          />
          <button
            type="button"
            aria-label="放大谱面"
            onClick={() => change_zoom(1)}
          >
            <Plus size={14} />
          </button>
          <output>{zoom_percent}%</output>
        </div>
      </header>
      <div className="score-zoom-viewport">
        <div className="score-zoom-content">
          {children}
        </div>
      </div>
    </section>
  );
}

interface touch_list_like {
  item: (index: number) => { clientX: number; clientY: number } | null;
}

function get_touch_distance(touches: touch_list_like): number {
  const first = touches.item(0);
  const second = touches.item(1);
  if (!first || !second) {
    return 0;
  }
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}
