import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, FileMusic, Hand, Heart, LoaderCircle, MapPin, Trash2 } from "lucide-react";

import { use_app_settings_store } from "@/store/useAppSettingsStore";
import {
  is_score_favorite,
  load_score_favorites,
  save_score_favorites,
  toggle_score_favorite,
} from "@/features/repertoire/favorites";
import { MaterialReviewGate } from "./MaterialReviewGate";
import { MusicXmlScoreRenderer } from "./MusicXmlScoreRenderer";
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
}

type render_state = "loading" | "ready" | "error";

export function MaterialScoreViewer({
  segment,
  review_record,
  on_review_transition,
  on_review_reset,
  on_delete_segment,
  is_deleting = false,
}: material_score_viewer_props) {
  const [render_state, set_render_state] = useState<render_state>("loading");
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
            {render_state === "loading" && (
              <p className="material-score-loading">
                <LoaderCircle size={18} />
                正在加载教材原谱…
              </p>
            )}
            <MusicXmlScoreRenderer
              musicxml_url={segment.musicxml_url}
              practice_events_url={segment.derived_assets?.practice_events_url}
              show_fingerings={show_fingerings}
              on_state_change={set_render_state}
            />
          </div>

          {render_state === "error" && (
            <p className="material-score-error">
              <CircleAlert size={17} />
              乐谱暂时未能显示。请继续对照本地纸本教材完成练习。
            </p>
          )}

          {render_state === "ready" && (
            <p className="material-score-provenance">
              已完成谱面渲染 · 对照方式：{segment.mapping_confidence === "source_page" ? "按源页关联" : "练习编号已确认"}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function get_material_favorite_id(segment: material_segment): string {
  return `material:${segment.material_id}:${segment.id}`;
}
