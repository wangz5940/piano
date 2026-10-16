import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpenText, ChevronDown, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import { useCenteredActiveItem } from "@/hooks/useCenteredActiveItem";
import type { jianpu_material, jianpu_segment } from "./types";

export function JianpuCatalog({
  material,
  chapter_id,
  segment_id,
}: {
  material: jianpu_material;
  chapter_id?: string;
  segment_id?: string;
}) {
  const [query, set_query] = useState("");
  const active_chapter_ids = useMemo(() => new Set(
    chapter_id ? [chapter_id] : material.segments
      .find((segment) => segment.id === segment_id)?.page_slices
      .map((slice) => slice.chapter_id) ?? [],
  ), [chapter_id, material.segments, segment_id]);
  const [expanded_ids, set_expanded_ids] = useState(active_chapter_ids);
  const list_ref = useRef<HTMLDivElement>(null);
  const search_query = normalize_search(query);

  useEffect(() => {
    set_expanded_ids((current) => new Set([...current, ...active_chapter_ids]));
  }, [active_chapter_ids]);

  const groups = useMemo(() => material.chapters.map((chapter, index) => {
    const segments = material.segments.filter((segment) =>
      segment.page_slices.some((slice) => slice.chapter_id === chapter.id));
    const page_query = search_query.match(/^第?\s*(\d+)\s*页$/);
    const matches_chapter = !page_query && normalize_search(chapter.title).includes(search_query);
    const matching_segments = !search_query || matches_chapter ? segments
      : segments.filter((segment) => matches_segment(segment, search_query));
    const matches_page = page_query && Number(page_query[1]) >= chapter.page_start &&
      Number(page_query[1]) <= chapter.page_end;
    return { chapter, index, segments, matching_segments, matches_chapter, matches_page };
  }).filter((group) => !search_query || group.matches_chapter ||
    group.matches_page || group.matching_segments.length > 0), [material, search_query]);

  useCenteredActiveItem(
    list_ref,
    `${material.id}:${chapter_id}:${segment_id}:${search_query}:${[...expanded_ids].join(",")}`,
    { active_selector: ".jianpu-chapter-tree-content:not([hidden]) .is-selected" },
  );

  const all_expanded = groups.length > 0 &&
    groups.every((group) => expanded_ids.has(group.chapter.id));

  return (
    <>
      <div className="jianpu-catalog-tools">
        <label className="jianpu-catalog-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => set_query(event.target.value)}
            placeholder="标题、练习编号、页码"
            aria-label={`搜索${material.title}目录`}
          />
          {query && (
            <button type="button" onClick={() => set_query("")} aria-label="清除目录搜索">
              <X size={14} />
            </button>
          )}
        </label>
        <div className="jianpu-catalog-actions">
          <span role="status">
            {search_query
              ? `${groups.length} 个章节 · ${new Set(groups.flatMap((group) =>
                  group.matching_segments.map((segment) => segment.id))).size} 项练习`
              : `${material.chapters.length} 个章节 · ${material.segments.length} 项练习`}
          </span>
          {!search_query && (
            <button
              type="button"
              onClick={() => set_expanded_ids(all_expanded ? new Set()
                : new Set(material.chapters.map((chapter) => chapter.id)))}
            >
              {all_expanded ? "全部收起" : "全部展开"}
            </button>
          )}
        </div>
      </div>
      <div className="jianpu-segment-list" ref={list_ref}>
        {groups.map(({ chapter, index, segments, matching_segments }) => {
          const is_expanded = Boolean(search_query) || expanded_ids.has(chapter.id);
          const is_active = active_chapter_ids.has(chapter.id);
          const content_id = `jianpu-chapter-${material.id}-${chapter.id}`;
          return (
            <div key={chapter.id} className={`jianpu-segment-tree ${is_active ? "is-current" : ""}`}>
              <button
                type="button"
                className="jianpu-chapter-toggle"
                aria-expanded={is_expanded}
                aria-controls={content_id}
                onClick={() => set_expanded_ids((current) => {
                  const next = new Set(current);
                  if (next.has(chapter.id)) next.delete(chapter.id);
                  else next.add(chapter.id);
                  return next;
                })}
                disabled={Boolean(search_query)}
              >
                <span className="jianpu-chapter-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="jianpu-chapter-copy">
                  <strong>{chapter.title}</strong>
                  <small>第 {chapter.page_start}—{chapter.page_end} 页 · {segments.length} 项练习</small>
                </span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              <div id={content_id} className="jianpu-chapter-tree-content" hidden={!is_expanded}>
                <Link
                  to={`/简谱教材/${material.id}/章节/${chapter.id}`}
                  className={`jianpu-chapter-link ${chapter.id === chapter_id ? "is-selected" : ""}`}
                  aria-current={chapter.id === chapter_id ? "page" : undefined}
                >
                  <BookOpenText size={14} />
                  <strong>章节导读</strong>
                  <ArrowRight size={14} />
                </Link>
                {matching_segments.map((segment) => (
                  <Link
                    key={segment.id}
                    to={`/简谱教材/${material.id}/${segment.id}`}
                    className={`jianpu-segment-link ${segment.id === segment_id ? "is-selected" : ""}`}
                    aria-current={segment.id === segment_id ? "page" : undefined}
                    title={segment.title}
                  >
                    <span className="jianpu-segment-sequence">
                      {String(segment.sequence).padStart(3, "0")}
                    </span>
                    <span className="jianpu-segment-copy">
                      <strong>{segment.title}</strong>
                      <small>
                        <span>第 {segment.source_pages.join("、")} 页</span>
                        <span>{segment.hand_mode === "both" ? "双手谱"
                          : segment.hand_mode === "right" ? "右手谱" : "左手谱"}</span>
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {groups.length === 0 && <p className="jianpu-catalog-empty">未找到匹配内容</p>}
      </div>
    </>
  );
}

function normalize_search(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function matches_segment(segment: jianpu_segment, query: string): boolean {
  const page_query = query.match(/^第?\s*(\d+)\s*页$/);
  if (page_query) return segment.source_pages.includes(Number(page_query[1]));
  if (/^\d+$/.test(query) &&
    (segment.source_pages.includes(Number(query)) || segment.sequence === Number(query))) {
    return true;
  }
  return normalize_search([
    segment.title,
    ...segment.exercise_labels,
    ...segment.page_slices.map((slice) => slice.title),
  ].join(" ")).includes(query);
}
