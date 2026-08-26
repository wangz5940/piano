import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, CircleAlert, FileMusic, Hand, Heart, LoaderCircle, MapPin, ScanSearch, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { use_app_settings_store } from "@/store/useAppSettingsStore";
import {
  is_score_favorite,
  load_score_favorites,
  save_score_favorites,
  toggle_score_favorite,
} from "@/features/repertoire/favorites";
import { MaterialReviewGate } from "./MaterialReviewGate";
import { MusicXmlScoreRenderer } from "./MusicXmlScoreRenderer";
import { ScoreZoomSurface } from "./ScoreZoomSurface";
import { get_material_status_copy, get_material_status_label } from "./policy";
import type {
  material_review_record,
  material_segment,
} from "./types";

interface material_score_viewer_props {
  segment: material_segment;
  review_record?: material_review_record;
  on_review_transition?: (record: material_review_record) => void;
  on_review_reset?: () => void;
  on_delete_segment?: () => void;
  is_deleting?: boolean;
  navigation?: material_segment_navigation_props;
  calibration_href?: string;
}

type render_state = "loading" | "ready" | "error";

export function MaterialScoreViewer({
  segment,
  review_record,
  on_review_transition,
  on_review_reset,
  on_delete_segment,
  is_deleting = false,
  navigation,
  calibration_href,
}: material_score_viewer_props) {
  const [is_expanded, set_is_expanded] = useState(true);
  const [favorite_entries, set_favorite_entries] = useState(load_score_favorites);
  const show_fingerings = use_app_settings_store((state) => state.show_fingerings);
  const set_show_fingerings = use_app_settings_store((state) => state.set_show_fingerings);
  const display_title = segment.title.replace("乐章", "片段");
  const favorite_id = get_material_favorite_id(segment);
  const is_favorite = is_score_favorite(favorite_entries, favorite_id);

  useEffect(() => {
    save_score_favorites(favorite_entries);
  }, [favorite_entries]);

  return (
    <section className="material-score-viewer" aria-label={`${display_title}教材对照谱`}>
      <header className="material-score-head">
        <div>
          <p className="section-kicker"><FileMusic size={15} /> 教材对照谱</p>
          <h2>{display_title}</h2>
        </div>
        <div className="material-score-head-actions">
          {navigation && (
            <ScoreSequenceControls
              previous_title={navigation.previous_segment?.title}
              next_title={navigation.next_segment?.title}
              current_index={navigation.current_index}
              total_count={navigation.total_count}
              switching_direction={navigation.switching_direction}
              on_previous={navigation.previous_segment
                ? () => navigation.on_navigate(navigation.previous_segment!, "previous")
                : undefined}
              on_next={navigation.next_segment
                ? () => navigation.on_navigate(navigation.next_segment!, "next")
                : undefined}
            />
          )}
          <span className="material-status-badge">
            <CircleAlert size={14} />
            {get_material_status_label(segment.status)}
          </span>
          <button
            type="button"
            className={`repertoire-favorite-toggle ${is_favorite ? "is-favorite" : ""}`}
            aria-pressed={is_favorite}
            aria-label={is_favorite ? `取消收藏${display_title}` : `收藏${display_title}`}
            onClick={() => set_favorite_entries((entries) =>
              toggle_score_favorite(entries, {
                id: favorite_id,
                kind: "material",
                title: display_title,
                subtitle: `${segment.source_page_label} · ${segment.measure_count} 小节`,
                href: `/教材/${segment.material_id}/${segment.id}`,
                source: "教材谱库",
              }))}
          >
            <Heart size={16} fill={is_favorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className={`score-option-toggle ${show_fingerings ? "is-selected" : ""}`}
            aria-pressed={show_fingerings}
            onClick={() => set_show_fingerings(!show_fingerings)}
          >
            <Hand size={14} />
            {show_fingerings ? "隐藏指法" : "显示指法"}
          </button>
          {calibration_href && (
            <Link to={calibration_href} className="score-collapse-toggle">
              <ScanSearch size={15} />
              去校准
            </Link>
          )}
          {on_delete_segment && (
            <button
              type="button"
              className="score-collapse-toggle is-danger"
              disabled={is_deleting}
              onClick={on_delete_segment}
            >
              <Trash2 size={15} />
              {is_deleting ? "删除中" : "删除"}
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
      </header>

      {is_expanded && (
        <>
          <div className="material-score-meta">
            <span><MapPin size={14} /> {segment.source_page_label.replace(/^PDF /, "原谱")}</span>
            <span>{segment.measure_count} 小节</span>
            <span>{segment.part_count} 个声部</span>
            {segment.time_signatures.map((time_signature) => <span key={time_signature}>{time_signature}</span>)}
          </div>

          <p className="material-review-notice">
            <CircleAlert size={16} />
            {get_material_status_copy(segment.status)}
          </p>

          {segment.ocr_labels.length > 0 && (
            <p className="material-score-context">
              识别标签：{segment.ocr_labels.join("、")}。请以纸本页码和谱面核对为准。
            </p>
          )}

          {on_review_transition && on_review_reset && (
            <MaterialReviewGate
              segment={segment}
              review_record={review_record}
              on_transition={on_review_transition}
              on_reset={on_review_reset}
            />
          )}

          <div className="material-score-canvas">
            <MaterialScoreSlice
              segment={segment}
              show_fingerings={show_fingerings}
              measure_start={1}
              measure_end={segment.measure_count}
            />
          </div>

          <p className="material-score-provenance">
            自适应原谱排版 · 对照方式：{segment.mapping_confidence === "source_page" ? "按源页关联" : "练习编号已确认"}
          </p>
        </>
      )}
    </section>
  );
}

interface material_segment_navigation_props {
  previous_segment?: material_segment;
  next_segment?: material_segment;
  current_index: number;
  total_count: number;
  switching_direction?: "previous" | "next";
  on_navigate: (segment: material_segment, direction: "previous" | "next") => void;
}

function ScoreSequenceControls({
  previous_title,
  next_title,
  current_index,
  total_count,
  switching_direction,
  on_previous,
  on_next,
}: {
  previous_title?: string;
  next_title?: string;
  current_index: number;
  total_count: number;
  switching_direction?: "previous" | "next";
  on_previous?: () => void;
  on_next?: () => void;
}) {
  return (
    <div className="score-sequence-controls" aria-label="曲目顺序切换">
      <button
        type="button"
        className={switching_direction === "previous" ? "is-switching" : ""}
        disabled={!on_previous || Boolean(switching_direction)}
        title={previous_title ? `上一曲：${previous_title}` : "已经是第一曲"}
        onClick={on_previous}
      >
        <ChevronsLeft size={15} />
        {switching_direction === "previous" ? "切换中" : "上一曲"}
      </button>
      <span>{current_index + 1}/{total_count}</span>
      <button
        type="button"
        className={switching_direction === "next" ? "is-switching" : ""}
        disabled={!on_next || Boolean(switching_direction)}
        title={next_title ? `下一曲：${next_title}` : "已经是最后一曲"}
        onClick={on_next}
      >
        {switching_direction === "next" ? "切换中" : "下一曲"}
        <ChevronsRight size={15} />
      </button>
    </div>
  );
}

function MaterialScoreSlice({
  segment,
  show_fingerings,
  measure_start,
  measure_end,
}: {
  segment: material_segment;
  show_fingerings: boolean;
  measure_start: number;
  measure_end: number;
}) {
  const [render_state, set_render_state] = useState<render_state>("loading");

  return (
    <ScoreZoomSurface
      measure_start={measure_start}
      measure_end={measure_end}
      className="material-score-slice"
    >
      {render_state === "loading" && (
        <p className="material-score-loading">
          <LoaderCircle size={18} />
          正在加载本段原谱…
        </p>
      )}
      {render_state === "error" && (
        <p className="material-score-error">
          <CircleAlert size={17} />
          本段原谱暂时未能显示。
        </p>
      )}
      <MusicXmlScoreRenderer
        musicxml_url={segment.musicxml_url}
        practice_events_url={segment.derived_assets?.practice_events_url}
        show_fingerings={show_fingerings}
        render_measure_start={measure_start}
        render_measure_end={measure_end}
        on_state_change={set_render_state}
      />
    </ScoreZoomSurface>
  );
}

function get_material_favorite_id(segment: material_segment): string {
  return `material:${segment.material_id}:${segment.id}`;
}
