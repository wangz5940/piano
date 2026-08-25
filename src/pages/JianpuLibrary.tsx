import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  FileMusic,
  FileSearch,
  Heart,
  LibraryBig,
  LoaderCircle,
  MapPin,
  Music2,
  Rows3,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { MusicXmlScoreRenderer } from "@/features/assets/MusicXmlScoreRenderer";
import type { material_id } from "@/features/assets/types";
import {
  is_score_favorite,
  load_score_favorites,
  save_score_favorites,
  toggle_score_favorite,
  type score_favorite_entry,
} from "@/features/repertoire/favorites";
import {
  load_jianpu_catalog,
  load_jianpu_score,
} from "@/features/jianpu/loadJianpuLibrary";
import { soft_delete_material_segment } from "@/features/materials/materialDeletion";
import {
  JianpuRenderer,
  to_render_score_from_jianpu_score,
} from "@/features/jianpu/render";
import { use_app_settings_store } from "@/store/useAppSettingsStore";
import { use_auth_store } from "@/store/useAuthStore";
import type {
  jianpu_catalog,
  jianpu_chapter,
  jianpu_hand_mode,
  jianpu_material,
  jianpu_page_slice,
  jianpu_score,
  jianpu_segment,
} from "@/features/jianpu/types";

type reading_view = "jianpu" | "original";
type render_state = "loading" | "ready" | "error";

interface jianpu_library_props {
  initial_catalog?: jianpu_catalog;
}

export function JianpuLibrary({ initial_catalog }: jianpu_library_props) {
  const { material_id: route_material_id, segment_id, chapter_id } = useParams();
  const user = use_auth_store((state) => state.user);
  const [catalog, set_catalog] = useState(initial_catalog);
  const [load_error, set_load_error] = useState<string>();
  const [delete_message, set_delete_message] = useState<string>();
  const [deleting_segment_id, set_deleting_segment_id] = useState<string>();
  const [is_navigation_collapsed, set_is_navigation_collapsed] = useState(false);
  const [favorite_entries, set_favorite_entries] = useState(load_score_favorites);

  useEffect(() => {
    if (initial_catalog) {
      return;
    }

    let active = true;
    void load_jianpu_catalog()
      .then((next_catalog) => {
        if (active) {
          set_catalog(next_catalog);
        }
      })
      .catch(() => {
        if (active) {
          set_load_error("简谱教材暂时无法加载，请稍后重试。");
        }
      });
    return () => {
      active = false;
    };
  }, [initial_catalog]);

  useEffect(() => {
    save_score_favorites(favorite_entries);
  }, [favorite_entries]);

  if (load_error) {
    return <JianpuLibraryState title="简谱教材暂时不可用" copy={load_error} is_error />;
  }
  if (!catalog) {
    return <JianpuLibraryState title="正在准备简谱教材" copy="正在读取教材索引、文字提示和双手简谱。" />;
  }

  const material = get_selected_material(catalog, route_material_id);
  if (!material) {
    return (
      <JianpuLibraryState
        title="未找到指定教材"
        copy="请从简谱教材目录重新选择需要阅读的教材。"
        is_error
      />
    );
  }
  const default_chapter = route_material_id === undefined && segment_id === undefined
    ? get_default_chapter(material)
    : undefined;
  const chapter = chapter_id
    ? get_selected_chapter(material, chapter_id)
    : default_chapter;
  if (chapter_id && !chapter) {
    return (
      <JianpuLibraryState
        title="未找到指定章节"
        copy={`“${material.title}”中没有这个教材章节，请从目录重新选择。`}
        is_error
      />
    );
  }
  const segment = chapter ? undefined : get_selected_segment(material, segment_id);
  if (!chapter && !segment) {
    return (
      <JianpuLibraryState
        title="未找到指定片段"
        copy={`“${material.title}”中没有这个阅读片段，请从目录重新选择。`}
        is_error
      />
    );
  }
  const handle_delete_segment = async (target_segment: jianpu_segment) => {
    if (typeof window !== "undefined" &&
      !window.confirm(`确认删除“${target_segment.title}”？删除后会从教材谱库、简谱教材和校准台隐藏。`)) {
      return;
    }
    set_deleting_segment_id(target_segment.id);
    set_delete_message(undefined);
    try {
      await soft_delete_material_segment(material.id, target_segment.id);
      set_catalog((current) =>
        current ? remove_jianpu_segment_from_catalog(current, material.id, target_segment.id) : current);
      if (!initial_catalog) {
        set_catalog(await load_jianpu_catalog());
      }
      set_delete_message("教材片段已删除，并已从所有教材入口隐藏。");
    } catch (error) {
      set_delete_message(error instanceof Error ? error.message : "教材片段删除失败。");
    } finally {
      set_deleting_segment_id(undefined);
    }
  };

  return (
    <AppShell>
      <section className="page-intro jianpu-library-intro">
        <div>
          <p className="eyebrow"><Music2 size={15} /> 原教材文字与简谱练习</p>
          <h1>先沿章节理解，<br />再逐页落到琴键上。</h1>
          <p className="intro-copy">
            目录遵循教材原有章节。章节导读完整保留原页文字；进入练习片段后，
            再按原页阅读提示、手别和对应简谱。
          </p>
        </div>
        <div className="jianpu-library-rule">
          <Rows3 size={19} />
          <div>
            <strong>阅读顺序</strong>
            <p>先读章节导读，再查看本页内容与关联练习，最后连接成完整片段。</p>
          </div>
        </div>
      </section>

      <div className="jianpu-material-tabs" role="tablist" aria-label="简谱教材选择">
        {catalog.materials.map((item) => (
          <Link
            key={item.id}
            to={get_jianpu_route(item)}
            className={item.id === material.id ? "is-selected" : ""}
            role="tab"
            aria-selected={item.id === material.id}
          >
            <BookOpenText size={17} />
            <span>{item.title}</span>
            <small>{item.chapters.length} 个章节 · {item.segments.length} 个练习片段</small>
          </Link>
        ))}
      </div>

      <section className={`jianpu-library-layout ${is_navigation_collapsed ? "is-navigation-collapsed" : ""}`}>
        <aside
          className={`jianpu-segment-panel ${is_navigation_collapsed ? "is-collapsed" : ""}`}
          aria-label={`${material.title}章节与练习目录`}
        >
          <div className="jianpu-segment-panel-head">
            {!is_navigation_collapsed && (
              <div>
                <p className="section-kicker"><LibraryBig size={15} /> 阅读索引</p>
                <h2>{material.title}</h2>
              </div>
            )}
            {!is_navigation_collapsed && <span>{material.page_count} 页</span>}
            <button
              type="button"
              className="jianpu-navigation-toggle"
              onClick={() => set_is_navigation_collapsed((value) => !value)}
              aria-label={is_navigation_collapsed ? "展开阅读目录" : "收起阅读目录"}
              aria-expanded={!is_navigation_collapsed}
            >
              {is_navigation_collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
            </button>
          </div>
          {!is_navigation_collapsed && (
            <>
              <p>{material.description}</p>
              <div className="jianpu-segment-list">
                {get_chapter_tree_groups(material).map((group) => (
                  <details
                    key={group.chapter.id}
                    className="jianpu-segment-tree"
                    open={group.chapter.id === chapter?.id ||
                      group.segments.some((item) => item.id === segment?.id)}
                  >
                    <summary>
                      <span>{group.chapter.title}</span>
                      <small>
                        第 {group.chapter.page_start}—{group.chapter.page_end} 页 ·
                        {" "}{group.segments.length > 0 ? `${group.segments.length} 项练习` : "章节导读"}
                      </small>
                    </summary>
                    <div className="jianpu-chapter-tree-content">
                      <JianpuChapterLink
                        material={material}
                        chapter={group.chapter}
                        selected={group.chapter.id === chapter?.id}
                      />
                      {group.segments.map((item) => (
                        <JianpuSegmentLink
                          key={item.id}
                          material={material}
                          segment={item}
                          selected={item.id === segment?.id}
                        />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}
        </aside>

        <div className="jianpu-reader-column">
          {delete_message && (
            <p className="jianpu-library-message">{delete_message}</p>
          )}
          {chapter ? (
            <JianpuChapterReader material={material} chapter={chapter} />
          ) : (
            <JianpuReader
              material={material}
              segment={segment!}
              is_favorite={is_score_favorite(
                favorite_entries,
                get_jianpu_favorite_id(material, segment!),
              )}
              on_toggle_favorite={() => set_favorite_entries((entries) =>
                toggle_score_favorite(entries, create_jianpu_favorite(material, segment!)))}
              on_delete={user?.role === "admin"
                ? () => handle_delete_segment(segment!)
                : undefined}
              is_deleting={deleting_segment_id === segment!.id}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}

function JianpuLibraryState({
  title,
  copy,
  is_error = false,
}: {
  title: string;
  copy: string;
  is_error?: boolean;
}) {
  return (
    <AppShell>
      <section className={`jianpu-library-state ${is_error ? "is-error" : ""}`}>
        {is_error ? <CircleAlert size={24} /> : <FileSearch size={24} />}
        <h1>{title}</h1>
        <p>{copy}</p>
      </section>
    </AppShell>
  );
}

function JianpuSegmentLink({
  material,
  segment,
  selected,
}: {
  material: jianpu_material;
  segment: jianpu_segment;
  selected: boolean;
}) {
  return (
    <Link
      to={`/简谱教材/${material.id}/${segment.id}`}
      className={`jianpu-segment-link ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
    >
      <span className="jianpu-segment-sequence">{String(segment.sequence).padStart(3, "0")}</span>
      <span className="jianpu-segment-copy">
        <strong>{segment.title}</strong>
        <small><MapPin size={12} /> {segment.source_page_label}</small>
        <em>{get_hand_mode_score_label(segment.hand_mode)}</em>
      </span>
      <ArrowRight size={15} />
    </Link>
  );
}

function JianpuChapterLink({
  material,
  chapter,
  selected,
}: {
  material: jianpu_material;
  chapter: jianpu_chapter;
  selected: boolean;
}) {
  return (
    <Link
      to={get_chapter_route(material, chapter)}
      className={`jianpu-chapter-link ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
    >
      <BookOpenText size={14} />
      <span>
        <strong>章节导读</strong>
        <small>阅读本章原页文字</small>
      </span>
      <ArrowRight size={14} />
    </Link>
  );
}

function get_chapter_tree_groups(
  material: jianpu_material,
): Array<{ chapter: jianpu_chapter; segments: jianpu_segment[] }> {
  return material.chapters
    .map((chapter) => ({
      chapter,
      segments: material.segments.filter((segment) =>
        segment.page_slices.some((slice) => slice.chapter_id === chapter.id)),
    }));
}

function JianpuChapterReader({
  material,
  chapter,
}: {
  material: jianpu_material;
  chapter: jianpu_chapter;
}) {
  const pages = material.pages.filter((page) =>
    page.page >= chapter.page_start && page.page <= chapter.page_end);

  return (
    <article className="jianpu-reader">
      <header className="jianpu-reader-head">
        <div>
          <p className="section-kicker"><BookOpenText size={15} /> 教材章节</p>
          <h2>{chapter.title}</h2>
          <p>
            原谱第 {chapter.page_start}—{chapter.page_end} 页 · {chapter.description}
          </p>
        </div>
      </header>

      <section className="jianpu-page-reader" aria-label={`${chapter.title}章节导读`}>
        {pages.map((page) => (
          <JianpuChapterPage
            key={page.page}
            material={material}
            page={page}
          />
        ))}
      </section>
    </article>
  );
}

function JianpuChapterPage({
  material,
  page,
}: {
  material: jianpu_material;
  page: jianpu_material["pages"][number];
}) {
  const related_segments = material.segments.filter((segment) =>
    segment.source_pages.includes(page.page));

  return (
    <article className="jianpu-page-card">
      <header className="jianpu-page-card-head">
        <span>{String(page.page).padStart(2, "0")}</span>
        <div>
          <p>原谱第 {page.page} 页</p>
          <h3>{page.title}</h3>
        </div>
        <small>章节导读</small>
      </header>
      <details className="jianpu-page-instruction jianpu-collapsible-section" open>
        <summary>
          <span><BookOpenText size={14} /> 本页内容</span>
          <small>{page.text.split("\n").length} 段提示</small>
          <ChevronDown size={15} />
        </summary>
        <div>
          {page.text.split("\n").map((paragraph, index) => (
            <p key={`${page.page}-${index}`}>{paragraph}</p>
          ))}
        </div>
      </details>
      {related_segments.length > 0 ? (
        <div className="jianpu-page-segment-links">
          <p>关联练习</p>
          {related_segments.map((segment) => (
            <Link
              key={segment.id}
              to={`/简谱教材/${material.id}/${segment.id}`}
            >
              <Music2 size={14} />
              <span>{get_segment_page_title(segment, page.page)}</span>
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
      ) : (
        <p className="jianpu-text-only-note">
          这一页以阅读与理解为主，完成本页提示后再进入后续练习。
        </p>
      )}
    </article>
  );
}

function get_segment_page_title(segment: jianpu_segment, page: number): string {
  return segment.page_slices.find((slice) => slice.source_pages.includes(page))?.title
    ?? segment.title;
}

function JianpuReader({
  material,
  segment,
  is_favorite,
  on_toggle_favorite,
  on_delete,
  is_deleting = false,
}: {
  material: jianpu_material;
  segment: jianpu_segment;
  is_favorite: boolean;
  on_toggle_favorite: () => void;
  on_delete?: () => void;
  is_deleting?: boolean;
}) {
  const [reading_view, set_reading_view] = useState<reading_view>("jianpu");
  const [score, set_score] = useState<jianpu_score>();
  const [score_state, set_score_state] = useState<render_state>("loading");
  const hand_label = score
    ? get_score_hand_label(score)
    : get_hand_mode_reader_label(segment.hand_mode);

  useEffect(() => {
    let active = true;
    set_score(undefined);
    set_score_state("loading");
    void load_jianpu_score(segment.jianpu_url)
      .then((next_score) => {
        if (active) {
          set_score(next_score);
          set_score_state("ready");
        }
      })
      .catch(() => {
        if (active) {
          set_score_state("error");
        }
      });

    return () => {
      active = false;
    };
  }, [segment.jianpu_url]);

  return (
    <article className="jianpu-reader">
      <header className="jianpu-reader-head">
        <div>
          <p className="section-kicker"><Music2 size={15} /> 简谱教材</p>
          <h2>{segment.title}</h2>
          <p>
            {segment.section_title && `${segment.section_title} · `}
            {segment.source_page_label} · {segment.measure_count} 小节 · {hand_label}
          </p>
        </div>
        <div className="jianpu-reader-head-actions">
          <button
            type="button"
            className={`repertoire-favorite-toggle ${is_favorite ? "is-favorite" : ""}`}
            aria-pressed={is_favorite}
            aria-label={is_favorite ? `取消收藏${segment.title}` : `收藏${segment.title}`}
            onClick={on_toggle_favorite}
          >
            <Heart size={16} fill={is_favorite ? "currentColor" : "none"} />
          </button>
          <Link to={`/教材/${material.id}/${segment.id}`} className="jianpu-original-link">
            <FileMusic size={16} />
            原谱对照
          </Link>
          {on_delete && (
            <button
              type="button"
              className="jianpu-original-link is-danger"
              disabled={is_deleting}
              onClick={on_delete}
            >
              <Trash2 size={16} />
              {is_deleting ? "删除中" : "删除"}
            </button>
          )}
        </div>
      </header>

      <div className="jianpu-view-switch" role="group" aria-label="阅读视图">
        <button
          type="button"
          className={reading_view === "jianpu" ? "is-selected" : ""}
          aria-pressed={reading_view === "jianpu"}
          onClick={() => set_reading_view("jianpu")}
        >
          <Music2 size={15} />
          简谱
        </button>
        <button
          type="button"
          className={reading_view === "original" ? "is-selected" : ""}
          aria-pressed={reading_view === "original"}
          onClick={() => set_reading_view("original")}
        >
          <FileMusic size={15} />
          原谱
        </button>
      </div>

      {reading_view === "jianpu" ? (
        score_state === "loading" ? (
          <JianpuScoreState copy="正在排版本片段的简谱…" />
        ) : score_state === "error" || !score ? (
          <JianpuScoreState copy="本片段暂时无法显示简谱，请先切换到原谱核对。" is_error />
        ) : (
          <JianpuPageSliceReader score={score} page_slices={segment.page_slices} />
        )
      ) : (
        <OriginalScorePanel musicxml_url={segment.musicxml_url} title={segment.title} />
      )}
    </article>
  );
}

function JianpuPageSliceReader({
  score,
  page_slices,
}: {
  score: jianpu_score;
  page_slices: jianpu_page_slice[];
}) {
  const [expanded_slice_keys, set_expanded_slice_keys] = useState<Set<string>>(
    () => get_initial_expanded_slice_keys(page_slices),
  );

  useEffect(() => {
    set_expanded_slice_keys(get_initial_expanded_slice_keys(page_slices));
  }, [score.segment_id, page_slices]);

  return (
    <section className="jianpu-page-reader" aria-label="按原谱页阅读简谱">
      {page_slices.map((page_slice, index) => {
        const previous_slice = page_slices[index - 1];
        const slice_key = get_page_slice_key(page_slice);
        const is_expanded = expanded_slice_keys.has(slice_key);
        const is_new_chapter = !previous_slice ||
          previous_slice.chapter_id !== page_slice.chapter_id;
        const page_score = {
          ...score,
          measures: score.measures.slice(page_slice.measure_start - 1, page_slice.measure_end),
        };
        return (
          <Fragment key={slice_key}>
            {is_new_chapter && (
              <div className="jianpu-chapter-heading">
                <span>教材章节</span>
                <h3>{page_slice.chapter_title}</h3>
              </div>
            )}
            <article id={`jianpu-slice-${slice_key}`} className="jianpu-page-card">
              <header className="jianpu-page-card-head">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p>{format_source_page_label(page_slice.source_pages)}</p>
                  <h3>{page_slice.title}</h3>
                </div>
                <small>
                  第 {page_slice.measure_start}—{page_slice.measure_end} 小节
                  {page_slice.mapping === "cross_page" && " · 跨页片段"}
                </small>
              </header>
              <details className="jianpu-page-instruction jianpu-collapsible-section" open>
                <summary>
                  <span><BookOpenText size={14} /> 本页提示</span>
                  <small>{page_slice.text.split("\n").length} 段提示</small>
                  <ChevronDown size={15} />
                </summary>
                <div>
                  {page_slice.text.split("\n").map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </details>
              {is_expanded ? (
                <TextbookJianpuScore
                  score={page_score}
                  is_page_slice
                  show_final_bar={page_slice.measure_end === score.measures.length}
                />
              ) : (
                <button
                  type="button"
                  className="jianpu-page-score-toggle"
                  onClick={() => set_expanded_slice_keys((current) => {
                    const next = new Set(current);
                    next.add(slice_key);
                    return next;
                  })}
                >
                  展开本页简谱
                  <ChevronsRight size={16} />
                </button>
              )}
            </article>
          </Fragment>
        );
      })}
    </section>
  );
}

function get_initial_expanded_slice_keys(page_slices: jianpu_page_slice[]): Set<string> {
  const first_slice = page_slices[0];
  if (!first_slice || get_slice_measure_count(first_slice) > 64) {
    return new Set();
  }
  const initial_slices = page_slices.length <= 2 &&
    page_slices.every((slice) => get_slice_measure_count(slice) <= 64)
    ? page_slices
    : [first_slice];
  return new Set(initial_slices.map(get_page_slice_key));
}

function get_page_slice_key(page_slice: jianpu_page_slice): string {
  return `${page_slice.source_pages.join("-")}-${page_slice.measure_start}-${page_slice.measure_end}`;
}

function get_slice_measure_count(page_slice: jianpu_page_slice): number {
  return page_slice.measure_end - page_slice.measure_start + 1;
}

function format_source_page_label(source_pages: number[]): string {
  return `原谱第 ${source_pages.join("、")} 页`;
}

function JianpuScoreState({ copy, is_error = false }: { copy: string; is_error?: boolean }) {
  return (
    <div className={`jianpu-score-state ${is_error ? "is-error" : ""}`}>
      {is_error ? <CircleAlert size={20} /> : <LoaderCircle size={20} />}
      <p>{copy}</p>
    </div>
  );
}

export function TextbookJianpuScore({
  score,
  is_page_slice = false,
  show_final_bar = true,
}: {
  score: jianpu_score;
  is_page_slice?: boolean;
  show_final_bar?: boolean;
}) {
  const render_score = useMemo(
    () => to_render_score_from_jianpu_score(score),
    [score],
  );
  const show_fingerings = use_app_settings_store((state) => state.show_fingerings);
  const chord_count = score.measures.reduce(
    (count, measure) => count + measure.events.filter((event) => Boolean(event.chord)).length,
    0,
  );

  return (
    <section
      className={`textbook-jianpu-score ${is_page_slice ? "is-page-slice" : ""}`}
      aria-label="简谱"
    >
      <div className="textbook-jianpu-meta">
        <span>{score.key_signature}</span>
        <span>{score.time_signature}</span>
        <span>{get_score_hand_label(score)}</span>
        {chord_count > 0 && <span>含和弦标记</span>}
      </div>
      <JianpuRenderer
        score={render_score}
        mode="reading"
        show_fingerings={show_fingerings}
        show_final_bar={show_final_bar}
        className="textbook-jianpu-renderer"
      />
    </section>
  );
}

function get_score_hand_label(score: jianpu_score): string {
  return get_hand_mode_score_label(get_score_hand_mode(score));
}

function get_score_hand_mode(score: jianpu_score): jianpu_hand_mode {
  const has_right_hand = score.measures.some((measure) =>
    measure.events.some((event) => event.right_notes.length > 0));
  const has_left_hand = score.measures.some((measure) =>
    measure.events.some((event) => event.left_notes.length > 0));

  if (has_right_hand && has_left_hand) {
    return "both";
  }
  return has_right_hand ? "right" : "left";
}

function get_hand_mode_score_label(hand_mode: jianpu_hand_mode): string {
  if (hand_mode === "both") {
    return "双手谱";
  }
  return hand_mode === "right" ? "右手谱" : "左手谱";
}

function get_hand_mode_reader_label(hand_mode: jianpu_hand_mode): string {
  if (hand_mode === "both") {
    return "右手与左手";
  }
  return hand_mode === "right" ? "右手材料" : "左手材料";
}

function OriginalScorePanel({ musicxml_url, title }: { musicxml_url: string; title: string }) {
  const [render_state, set_render_state] = useState<render_state>("loading");
  const [is_expanded, set_is_expanded] = useState(true);

  return (
    <section className="jianpu-original-score" aria-label={`${title}原谱`}>
      <header className="jianpu-original-score-head">
        <p className="section-kicker"><FileMusic size={15} /> 原谱对照</p>
        <button
          type="button"
          className="score-collapse-toggle"
          aria-expanded={is_expanded}
          onClick={() => set_is_expanded((value) => !value)}
        >
          {is_expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {is_expanded ? "收起谱面" : "展开谱面"}
        </button>
      </header>
      {is_expanded && (
        <>
          {render_state === "loading" && <JianpuScoreState copy="正在加载本片段原谱…" />}
          {render_state === "error" && <JianpuScoreState copy="本片段原谱暂时无法显示。" is_error />}
          <MusicXmlScoreRenderer
            musicxml_url={musicxml_url}
            className="jianpu-original-score-host"
            on_state_change={set_render_state}
          />
        </>
      )}
    </section>
  );
}

function get_selected_material(
  catalog: jianpu_catalog,
  requested_material_id: string | undefined,
): jianpu_material | undefined {
  if (requested_material_id === undefined) {
    return catalog.materials.find((item) => item.id === "beyer") ?? catalog.materials[0];
  }
  return is_material_id(requested_material_id)
    ? catalog.materials.find((item) => item.id === requested_material_id)
    : undefined;
}

function remove_jianpu_segment_from_catalog(
  catalog: jianpu_catalog,
  material_id: material_id,
  segment_id: string,
): jianpu_catalog {
  return {
    ...catalog,
    materials: catalog.materials
      .map((material) => {
        if (material.id !== material_id) {
          return material;
        }
        return {
          ...material,
          segments: material.segments.filter((segment) => segment.id !== segment_id),
        };
      })
      .filter((material) => material.segments.length > 0),
  };
}

function get_selected_segment(
  material: jianpu_material,
  requested_segment_id: string | undefined,
): jianpu_segment | undefined {
  if (requested_segment_id === undefined) {
    return material.segments[0];
  }
  return material.segments.find((item) => item.id === requested_segment_id);
}

function get_selected_chapter(
  material: jianpu_material,
  requested_chapter_id: string,
): jianpu_chapter | undefined {
  return material.chapters.find((item) => item.id === requested_chapter_id);
}

function get_jianpu_route(material: jianpu_material): string {
  const first_chapter = get_default_chapter(material);
  return first_chapter ? get_chapter_route(material, first_chapter) : "/简谱教材";
}

function create_jianpu_favorite(
  material: jianpu_material,
  segment: jianpu_segment,
): Omit<score_favorite_entry, "updated_at"> {
  return {
    id: get_jianpu_favorite_id(material, segment),
    kind: "jianpu",
    title: segment.title,
    subtitle: `${material.title} · ${segment.source_page_label} · ${segment.measure_count} 小节`,
    href: `/简谱教材/${material.id}/${segment.id}`,
    source: "简谱教材",
  };
}

function get_jianpu_favorite_id(
  material: jianpu_material,
  segment: jianpu_segment,
): string {
  return `jianpu:${material.id}:${segment.id}`;
}

function get_chapter_route(
  material: jianpu_material,
  chapter: jianpu_chapter,
): string {
  return `/简谱教材/${material.id}/章节/${chapter.id}`;
}

function get_default_chapter(material: jianpu_material): jianpu_chapter | undefined {
  return material.chapters.find((chapter) => chapter.id !== "front-matter")
    ?? material.chapters[0];
}

function is_material_id(value: string | undefined): value is material_id {
  return (
    value === "beyer" ||
    value === "hanon" ||
    value === "john-thompson-easiest-1" ||
    value === "john-thompson-easiest-2"
  );
}
