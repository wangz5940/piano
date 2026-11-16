import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight, Grid3X3, Maximize, Minimize, X } from "lucide-react";

import { get_reading_score_number } from "./readingCatalog";
import type { jianpu_material, jianpu_segment } from "./types";

interface textbook_score_stage_props {
  material: jianpu_material;
  segment: jianpu_segment;
  children: ReactNode;
  switching_direction?: "previous" | "next";
  on_navigate: (segment: jianpu_segment, direction: "previous" | "next") => void;
}

export function TextbookScoreStage({
  material, segment, children, switching_direction, on_navigate,
}: textbook_score_stage_props) {
  const stage = useRef<HTMLElement>(null);
  const catalog_button = useRef<HTMLButtonElement>(null);
  const catalog_panel = useRef<HTMLElement>(null);
  const owns_native_fullscreen = useRef(false);
  const [is_fullscreen, set_is_fullscreen] = useState(false);
  const [show_navigation, set_show_navigation] = useState(false);
  const [is_catalog_open, set_is_catalog_open] = useState(false);
  const catalog_id = useId();
  const current_index = material.segments.findIndex((item) => item.id === segment.id);
  const previous = material.segments[current_index - 1];
  const next = material.segments[current_index + 1];

  const close_catalog = useCallback(() => {
    set_is_catalog_open(false);
    catalog_button.current?.focus({ preventScroll: true });
  }, []);

  const exit_fullscreen = useCallback(() => {
    set_is_fullscreen(false);
    set_show_navigation(false);
    if (document.fullscreenElement === stage.current) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggle_fullscreen = () => {
    if (is_fullscreen) {
      exit_fullscreen();
      return;
    }
    set_is_fullscreen(true);
    set_show_navigation(false);
    // The viewport presentation also works on browsers without the Fullscreen API.
    if (stage.current?.requestFullscreen) {
      void stage.current.requestFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const element = stage.current;
    const handle_fullscreen_change = () => {
      if (document.fullscreenElement === element) {
        owns_native_fullscreen.current = true;
        set_is_fullscreen(true);
      } else if (owns_native_fullscreen.current) {
        owns_native_fullscreen.current = false;
        set_is_fullscreen(false);
        set_show_navigation(false);
      }
    };
    document.addEventListener("fullscreenchange", handle_fullscreen_change);
    return () => {
      document.removeEventListener("fullscreenchange", handle_fullscreen_change);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!is_fullscreen) return;
    const previous_overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous_overflow; };
  }, [is_fullscreen]);

  useEffect(() => {
    if (!is_catalog_open) return;
    const active_item = catalog_panel.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    active_item?.focus({ preventScroll: true });
    active_item?.scrollIntoView({ block: "nearest" });
  }, [is_catalog_open]);

  useEffect(() => {
    const handle_key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (is_catalog_open) close_catalog();
        else if (is_fullscreen) exit_fullscreen();
        return;
      }
      if (is_catalog_open) {
        if (event.key !== "Tab") return;
        const items = catalog_panel.current?.querySelectorAll<HTMLButtonElement>("button");
        const first = items?.[0];
        const last = items?.[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (!is_fullscreen || switching_direction || event.altKey || event.ctrlKey || event.metaKey ||
        (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]"))) return;
      const target = event.key === "ArrowLeft" ? previous : event.key === "ArrowRight" ? next : undefined;
      if (target) {
        event.preventDefault();
        set_show_navigation(true);
        on_navigate(target, event.key === "ArrowLeft" ? "previous" : "next");
      }
    };
    document.addEventListener("keydown", handle_key);
    return () => document.removeEventListener("keydown", handle_key);
  }, [close_catalog, exit_fullscreen, is_catalog_open, is_fullscreen, next, on_navigate, previous, switching_direction]);

  const handle_score_click = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element) ||
      event.target.closest("button, a, input, select, textarea, summary, .score-zoom-toolbar")) return;
    const reading_area = is_fullscreen ? ".textbook-stage-scroll" : ".jianpu-reading-surface";
    if (!event.target.closest(reading_area)) return;
    set_show_navigation(true);
  };

  return (
    <section ref={stage}
      className={`textbook-score-stage ${is_fullscreen ? "is-fullscreen" : ""}`}
      aria-label={`${material.title}曲谱阅读器`}
      onClick={handle_score_click}>
      <div className="textbook-stage-scroll">{children}</div>

      <div className="textbook-stage-navigation" hidden={!show_navigation} aria-label="曲目顺序切换">
        <button type="button" className="textbook-stage-arrow is-previous"
          aria-label="上一首" title={previous ? `上一首：${previous.title}` : "已经是第一首"}
          disabled={!previous || Boolean(switching_direction)}
          onClick={() => previous && on_navigate(previous, "previous")}>
          <ChevronLeft size={28} />
        </button>
        <button type="button" className="textbook-stage-arrow is-next"
          aria-label="下一首" title={next ? `下一首：${next.title}` : "已经是最后一首"}
          disabled={!next || Boolean(switching_direction)}
          onClick={() => next && on_navigate(next, "next")}>
          <ChevronRight size={28} />
        </button>
      </div>

      <div className="textbook-stage-actions">
        <button type="button" onClick={toggle_fullscreen} aria-pressed={is_fullscreen}
          aria-label={is_fullscreen ? "退出全屏" : "全屏展示"}>
          {is_fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          <span>{is_fullscreen ? "退出全屏" : "全屏"}</span>
        </button>
        <button type="button" ref={catalog_button} aria-controls={catalog_id}
          aria-expanded={is_catalog_open} aria-label="曲谱目录"
          onClick={() => set_is_catalog_open((open) => !open)}>
          <Grid3X3 size={19} /><span>目录</span>
        </button>
      </div>

      {is_catalog_open && (
        <div className="textbook-catalog-backdrop" onClick={close_catalog}>
          <section ref={catalog_panel} id={catalog_id} className="textbook-catalog-popover"
            role="dialog" aria-modal="true" aria-labelledby={`${catalog_id}-title`}
            onClick={(event) => event.stopPropagation()}>
            <header>
              <div><h2 id={`${catalog_id}-title`}>{material.title}</h2><p>{material.segments.length} 首曲谱</p></div>
              <button type="button" aria-label="关闭目录" onClick={close_catalog}><X size={20} /></button>
            </header>
            <div className="textbook-catalog-grid">
              {material.segments.map((item, index) => (
                <button type="button" key={item.id} title={item.title}
                  aria-label={`${get_reading_score_number(material, item)} ${item.title}`}
                  aria-current={item.id === segment.id ? "true" : undefined}
                  className={item.id === segment.id ? "is-current" : ""}
                  onClick={() => {
                    if (item.id !== segment.id) on_navigate(item, index < current_index ? "previous" : "next");
                    close_catalog();
                  }}>
                  <strong>{get_reading_score_number(material, item)}</strong>
                  <small>{item.title}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
