import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  FileMusic,
  FileSearch,
  Heart,
  LibraryBig,
  LoaderCircle,
  Music2,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { order_textbook_materials } from "@/features/assets/materialOrder";
import { MusicXmlScoreRenderer } from "@/features/assets/MusicXmlScoreRenderer";
import { load_score_engine, start_score_measure } from "@/features/assets/loadScoreEngine";
import { ScoreZoomSurface } from "@/features/assets/ScoreZoomSurface";
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
} from "@/features/jianpu/loadJianpuLibrary";
import { group_material_by_content } from "@/features/jianpu/contentGrouping";
import { load_work_musicxml, load_work_score, prefetch_work_musicxml } from "@/features/jianpu/workScore";
import { personal_material } from "@/features/calibration/personalScore";
import { load_calibration_projects } from "@/features/calibration/storage";
import { soft_delete_material_segment } from "@/features/materials/materialDeletion";
import { JianpuCatalog } from "@/features/jianpu/JianpuCatalog";
import {
  JianpuRenderer,
  to_render_score_from_jianpu_score,
} from "@/features/jianpu/render";
import { use_app_settings_store } from "@/store/useAppSettingsStore";
import { use_auth_store } from "@/store/useAuthStore";
import type { account_user } from "@/features/auth/types";
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
  user_override?: account_user | null;
}

export function JianpuLibrary({ initial_catalog, user_override }: jianpu_library_props) {
  const { material_id: route_material_id, segment_id, chapter_id } = useParams();
  const navigate = useNavigate();
  const stored_user = use_auth_store((state) => state.user);
  const user = user_override === undefined ? stored_user : user_override ?? undefined;
  const [catalog, set_catalog] = useState(initial_catalog);
  const [load_error, set_load_error] = useState<string>();
  const [delete_message, set_delete_message] = useState<string>();
  const [deleting_segment_id, set_deleting_segment_id] = useState<string>();
  const [is_navigation_collapsed, set_is_navigation_collapsed] = useState(false);
  const [favorite_entries, set_favorite_entries] = useState(load_score_favorites);
  const [switching_direction, set_switching_direction] = useState<"previous" | "next">();
  const reading_materials = useMemo(() => {
    const projects = user?.id && typeof localStorage !== "undefined"
      ? load_calibration_projects(localStorage, user.id) : [];
    return catalog?.materials.map((material) => group_material_by_content(personal_material(material, projects)));
  }, [catalog, user?.id]);

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

  const ordered_materials = order_textbook_materials(reading_materials!);
  const material = get_selected_material(ordered_materials, route_material_id);
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
  const segment_navigation = segment
    ? get_jianpu_segment_navigation(material, segment)
    : undefined;
  const handle_navigate_segment = (
    target_segment: jianpu_segment,
    direction: "previous" | "next",
  ) => {
    set_switching_direction(direction);
    navigate(`/简谱教材/${material.id}/${target_segment.id}`);
    window.setTimeout(() => set_switching_direction(undefined), 360);
  };

  return (
    <AppShell>
      <section className="page-intro jianpu-library-intro">
        <div>
          <p className="eyebrow"><Music2 size={15} /> 原教材文字与简谱练习</p>
          <h1>简谱教材</h1>
        </div>
      </section>

      <div className="jianpu-material-tabs" role="tablist" aria-label="简谱教材选择">
        {ordered_materials.map((item) => (
          <Link
            key={item.id}
            to={get_jianpu_route(item)}
            className={item.id === material.id ? "is-selected" : ""}
            role="tab"
            aria-selected={item.id === material.id}
          >
            <BookOpenText size={17} />
            <span>{item.title}</span>
            <small>{item.chapters.length} 个章节 · {item.segments.length} 首乐曲与练习</small>
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
            <JianpuCatalog
              key={material.id}
              material={material}
              chapter_id={chapter?.id}
              segment_id={segment?.id}
            />
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
              key={user?.id ?? "guest"}
              material={material}
              segment={segment!}
              is_favorite={is_score_favorite(
                favorite_entries,
                get_jianpu_favorite_id(material, segment!),
              )}
              on_toggle_favorite={() => set_favorite_entries((entries) =>
                toggle_score_favorite(entries, create_jianpu_favorite(material, segment!)))}
              on_delete={user?.role === "admin" && (!segment!.sources ||
                (segment!.sources.length === 1 && segment!.sources[0].segment_id === segment!.id))
                ? () => handle_delete_segment(segment!)
                : undefined}
              is_deleting={deleting_segment_id === segment!.id}
              calibration_href={user
                ? get_calibration_route(material.id, segment!.sources?.[0].segment_id ?? segment!.id)
                : undefined}
              navigation={segment_navigation
                ? {
                    previous_segment: segment_navigation.previous_segment,
                    next_segment: segment_navigation.next_segment,
                    current_index: segment_navigation.current_index,
                    total_count: segment_navigation.total_count,
                    switching_direction,
                    on_navigate: handle_navigate_segment,
                  }
                : undefined}
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

function JianpuChapterReader({
  material,
  chapter,
}: {
  material: jianpu_material;
  chapter: jianpu_chapter;
}) {
  const pages = material.pages.filter((page) =>
    page.page >= chapter.page_start && page.page <= chapter.page_end);
  const works = material.segments.filter((segment) =>
    segment.page_slices[0].chapter_id === chapter.id);

  return (
    <article className="jianpu-reader">
      <header className="jianpu-reader-head">
        <div>
          <p className="section-kicker"><BookOpenText size={15} /> 教材章节</p>
          <h2>{chapter.title}</h2>
          <p>
            原谱第 {chapter.page_start}—{chapter.page_end} 页
          </p>
        </div>
      </header>

      <div className="jianpu-work-grid" aria-label={`${chapter.title}乐曲目录`}>
        {works.map((work, index) => (
          <Link key={work.id} to={`/简谱教材/${material.id}/${work.id}`} className="jianpu-work-entry">
            <span className="jianpu-work-number">{String(index + 1).padStart(2, "0")}</span>
            <div><h3>{work.title}</h3><p>{work.measure_count} 小节 · {work.source_page_label}</p></div>
            <ArrowRight size={17} />
          </Link>
        ))}
      </div>
      <details className="jianpu-page-instruction jianpu-collapsible-section">
        <summary><span><BookOpenText size={14} /> 章节学习提示</span><ChevronDown size={15} /></summary>
        {pages.map((page) => (
          <div key={page.page}><h3>{page.title}</h3>{page.text.split("\n").map((text, index) =>
            <p key={index}>{text}</p>)}</div>
        ))}
      </details>
    </article>
  );
}

function JianpuReader({
  material,
  segment,
  is_favorite,
  on_toggle_favorite,
  on_delete,
  is_deleting = false,
  navigation,
  calibration_href,
}: {
  material: jianpu_material;
  segment: jianpu_segment;
  is_favorite: boolean;
  on_toggle_favorite: () => void;
  on_delete?: () => void;
  is_deleting?: boolean;
  navigation?: jianpu_segment_navigation_props;
  calibration_href?: string;
}) {
  const [reading_view, set_reading_view] = useState<reading_view>("jianpu");
  const [opened_original, set_opened_original] = useState<jianpu_segment>();
  const original_button = useRef<HTMLButtonElement>(null);
  const user_id = use_auth_store((state) => state.user?.id);
  const [score, set_score] = useState<jianpu_score>();
  const [score_state, set_score_state] = useState<render_state>("loading");
  const hand_label = score
    ? get_score_hand_label(score)
    : get_hand_mode_reader_label(segment.hand_mode);
  const prepare_original = useCallback(() => {
    void load_score_engine().catch(() => {});
    // Reuse the existing per-URL cache; do not cache personal/combined XML by URL.
    void prefetch_work_musicxml(segment).catch(() => {});
  }, [segment]);

  useEffect(() => {
    if (reading_view === "original") set_opened_original(segment);
  }, [reading_view, segment]);

  useEffect(() => {
    const button = original_button.current;
    if (score_state !== "ready" || !button) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      prepare_original();
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [score_state, prepare_original]);

  useEffect(() => {
    let active = true;
    set_score(undefined);
    set_score_state("loading");
    void load_work_score(segment, user_id)
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
  }, [segment, user_id]);

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
          <button
            type="button"
            className={`repertoire-favorite-toggle ${is_favorite ? "is-favorite" : ""}`}
            aria-pressed={is_favorite}
            aria-label={is_favorite ? `取消收藏${segment.title}` : `收藏${segment.title}`}
            onClick={on_toggle_favorite}
          >
            <Heart size={16} fill={is_favorite ? "currentColor" : "none"} />
          </button>
          {calibration_href && (
            <Link to={calibration_href} className="jianpu-original-link">
              <ScanSearch size={16} />
              校对乐谱
            </Link>
          )}
          {calibration_href && [...new Set(segment.sources?.map((source) => source.segment_id))]
            .slice(1).map((source_id) => (
              <Link key={source_id} to={get_calibration_route(material.id, source_id)}
                className="jianpu-original-link">
                <ScanSearch size={16} /> 校对续段
              </Link>
            ))}
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
          ref={original_button}
          className={reading_view === "original" ? "is-selected" : ""}
          aria-pressed={reading_view === "original"}
          onPointerEnter={prepare_original}
          onPointerDown={prepare_original}
          onFocus={prepare_original}
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
          <JianpuPageSliceReader
            score={score}
            page_slices={segment.page_slices}
          />
        )
      ) : null}
      {(reading_view === "original" || opened_original === segment) && (
        <div hidden={reading_view !== "original"}>
          <OriginalScorePanel key={segment.id} segment={segment} />
        </div>
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
    <section className="jianpu-page-reader" aria-label="按小节组阅读简谱">
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
                </small>
              </header>
              <details className="jianpu-page-instruction jianpu-collapsible-section">
                <summary>
                  <span><BookOpenText size={14} /> 学习提示</span>
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
                <ScoreZoomSurface
                  measure_start={page_slice.measure_start}
                  measure_end={page_slice.measure_end}
                  className="textbook-score-slice"
                >
                  <TextbookJianpuScore
                    score={page_score}
                    is_page_slice
                    show_final_bar={page_slice.measure_end === score.measures.length}
                  />
                </ScoreZoomSurface>
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
                  展开本段谱面
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
  return new Set(page_slices.map(get_page_slice_key));
}

function get_page_slice_key(page_slice: jianpu_page_slice): string {
  return `${page_slice.source_pages.join("-")}-${page_slice.measure_start}-${page_slice.measure_end}`;
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

interface jianpu_segment_navigation_props {
  previous_segment?: jianpu_segment;
  next_segment?: jianpu_segment;
  current_index: number;
  total_count: number;
  switching_direction?: "previous" | "next";
  on_navigate: (segment: jianpu_segment, direction: "previous" | "next") => void;
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

function OriginalScorePanel({ segment }: { segment: jianpu_segment }) {
  const user_id = use_auth_store((state) => state.user?.id);
  const [render_state, set_render_state] = useState<render_state>("loading");
  const [musicxml, set_musicxml] = useState<string>();
  const [attempt, set_attempt] = useState(0);
  useEffect(() => {
    let active = true;
    set_musicxml(undefined);
    set_render_state("loading");
    // Start the independent engine download before waiting for source XML.
    void load_score_engine().catch(() => {});
    const finish_source = start_score_measure("source");
    void load_work_musicxml(segment, user_id).then((xml) => {
      if (active) {
        finish_source();
        set_musicxml(xml);
      }
    }).catch(() => { if (active) set_render_state("error"); });
    return () => { active = false; };
  }, [segment, user_id, attempt]);
  return (
    <section className="jianpu-original-score" aria-label={`${segment.title}原谱`}>
      <h3 className="jianpu-original-title">{segment.title}</h3>
      <ScoreZoomSurface measure_start={1} measure_end={segment.measure_count} className="original-score-slice">
        {render_state === "loading" && <JianpuScoreState copy="正在加载完整原谱…" />}
        {render_state === "error" && <>
          <JianpuScoreState copy="原谱暂时无法显示，请稍后重试。" is_error />
          <button type="button" className="jianpu-original-link" onClick={() => set_attempt((value) => value + 1)}>
            重新加载原谱
          </button>
        </>}
        {musicxml && <MusicXmlScoreRenderer
          musicxml_text={musicxml}
          className="jianpu-original-score-host"
          on_state_change={set_render_state}
        />}
      </ScoreZoomSurface>
    </section>
  );
}

function get_selected_material(
  materials: jianpu_material[],
  requested_material_id: string | undefined,
): jianpu_material | undefined {
  if (requested_material_id === undefined) {
    return materials[0];
  }
  return is_material_id(requested_material_id)
    ? materials.find((item) => item.id === requested_material_id)
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
  return material.segments.find((item) => item.id === requested_segment_id) ??
    material.segments.find((item) => item.sources?.some((source) =>
      source.segment_id === requested_segment_id));
}

function get_jianpu_segment_navigation(
  material: jianpu_material,
  segment: jianpu_segment,
) {
  const current_index = material.segments.findIndex((item) => item.id === segment.id);
  return {
    current_index: Math.max(0, current_index),
    total_count: material.segments.length,
    previous_segment: current_index > 0 ? material.segments[current_index - 1] : undefined,
    next_segment: current_index >= 0 && current_index < material.segments.length - 1
      ? material.segments[current_index + 1]
      : undefined,
  };
}

function get_calibration_route(material_id: material_id, segment_id: string): string {
  return `/校准?segment=${encodeURIComponent(`${material_id}:${segment_id}`)}`;
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
  return material.chapters.find((chapter) => chapter.id !== "front-matter" &&
    material.segments.some((segment) => segment.page_slices[0].chapter_id === chapter.id))
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
