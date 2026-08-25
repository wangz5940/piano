import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  ChevronDown,
  ChevronUp,
  Heart,
  ImageIcon,
  List,
  Music2,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PracticeScore } from "@/components/PracticeScore";
import { resolve_published_hymn_entries } from "@/features/curriculum/resolvePublishedHymns";
import { usePublishedCurriculum } from "@/features/curriculum/usePublishedCurriculum";
import {
  imported_jianpu_entries,
  imported_teaching_entries,
  repertoire_entries,
  type imported_jianpu_entry,
  type repertoire_entry,
} from "@/features/repertoire/data";
import {
  is_score_favorite,
  load_score_favorites,
  save_score_favorites,
  toggle_score_favorite,
  type score_favorite_entry,
} from "@/features/repertoire/favorites";

export function RepertoireLibrary() {
  const published_curriculum = usePublishedCurriculum();
  const hymn_entries = useMemo(
    () => resolve_published_hymn_entries(published_curriculum),
    [published_curriculum],
  );
  const imported_teaching_source_urls = new Set(
    imported_teaching_entries
      .map((entry) => entry.source_url)
      .filter((source_url): source_url is string => Boolean(source_url)),
  );
  const imported_preview_entries = imported_jianpu_entries.filter((entry) =>
    !imported_teaching_source_urls.has(entry.source_url));
  const all_teaching_entries = useMemo(
    () => [...repertoire_entries, ...hymn_entries, ...imported_teaching_entries],
    [hymn_entries],
  );
  const [favorite_entries_state, set_favorite_entries_state] = useState(load_score_favorites);
  const [collapse_all_token, set_collapse_all_token] = useState(0);
  const [expand_all_token, set_expand_all_token] = useState(0);
  const favorite_entries = all_teaching_entries.filter((entry) =>
    is_score_favorite(favorite_entries_state, get_repertoire_favorite_id(entry.id)));

  useEffect(() => {
    save_score_favorites(favorite_entries_state);
  }, [favorite_entries_state]);

  const handle_toggle_favorite = (entry: repertoire_entry) => {
    set_favorite_entries_state((entries) =>
      toggle_score_favorite(entries, create_repertoire_favorite(entry)));
  };

  const handle_collapse_all = () => {
    set_collapse_all_token((token) => token + 1);
  };

  const handle_expand_all = () => {
    set_expand_all_token((token) => token + 1);
  };

  const scroll_to_repertoire = (id: string) => {
    const target = document.getElementById(`repertoire-${id}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#repertoire-${id}`);
  };

  return (
    <AppShell>
      <section className="page-intro repertoire-intro">
        <div>
          <p className="eyebrow"><Music2 size={15} /> 热门曲库</p>
          <h1>认识的旋律，<br />也要学会独立读谱。</h1>
          <p className="intro-copy">
            这里现在分成两层：公版教学谱可以直接练，
            授权导入曲目已经按原始数据整理成整首教学谱，
            诗歌 PPTX 已先进入 OOXML 来源核对流程。
          </p>
        </div>
        <div className="repertoire-rights-note">
          <ShieldCheck size={19} />
          <div>
            <strong>全部导入曲目已结构化</strong>
            <p>授权导入曲目已经完整转换为可练习的 steps，原谱截图继续用于核对拍号、分句和双手排布。</p>
          </div>
        </div>
      </section>

      <section className="repertoire-toolbar" aria-label="热门曲目工具">
        <nav className="repertoire-toc" aria-label="热门曲目目录">
          <span className="repertoire-toc-label"><List size={15} /> 目录</span>
          <a href="#repertoire-favorites">我的收藏</a>
          <div className="repertoire-toc-song-list">
            {all_teaching_entries.map((entry) => (
              <a
                key={entry.id}
                href={`#repertoire-${entry.id}`}
                className="repertoire-toc-song"
                onClick={(event) => {
                  event.preventDefault();
                  scroll_to_repertoire(entry.id);
                }}
              >
                {entry.title}
              </a>
            ))}
          </div>
        </nav>
        <div className="repertoire-toolbar-actions">
          <button
            type="button"
            className="score-option-toggle repertoire-collapse-all"
            onClick={handle_collapse_all}
          >
            <ChevronDown size={15} />
            一键收起
          </button>
          <button
            type="button"
            className="score-option-toggle repertoire-expand-all"
            onClick={handle_expand_all}
          >
            <ChevronUp size={15} />
            一键展开
          </button>
        </div>
      </section>

      <section id="repertoire-favorites" className="repertoire-section repertoire-favorites-section" aria-label="我的收藏">
        <div className="section-heading repertoire-section-heading">
          <div>
            <p className="section-kicker"><Heart size={15} /> 我的收藏</p>
            <h2>收藏的曲目，随时回到详情。</h2>
          </div>
          <p className="repertoire-section-count">{favorite_entries.length} 首</p>
        </div>
        {favorite_entries.length > 0 ? (
          <div className="repertoire-favorites-list">
            {favorite_entries.map((entry) => (
              <article key={entry.id} className="repertoire-favorite-item">
                <div>
                  <strong>{entry.title}</strong>
                  <span>{entry.attribution} · {entry.score.steps.length} 个跟弹步</span>
                </div>
                <a
                  href={`#repertoire-${entry.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    scroll_to_repertoire(entry.id);
                  }}
                >
                  查看详情 <ChevronDown size={13} />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="repertoire-empty-copy">
            还没有收藏曲目。点击每首曲目右上角的心形按钮，收藏后会显示在这里。
          </p>
        )}
      </section>

      <section id="repertoire-public" className="repertoire-section" aria-label="公版教学谱">
        <div className="section-heading repertoire-section-heading">
          <div>
            <p className="section-kicker"><Music2 size={15} /> 公版教学谱</p>
            <h2>已经整理成适级教学版，可以直接跟弹。</h2>
          </div>
          <p className="repertoire-section-count">{repertoire_entries.length} 首</p>
        </div>
        <p className="repertoire-section-copy">
          这部分保留现有的练习谱、指法说明和教学目标，适合直接进入课程练习。
        </p>
        <div className="repertoire-list">
          {repertoire_entries.map((entry, index) => (
            <StructuredRepertoireCard
              key={entry.id}
              entry={entry}
              index={index}
              badge_label="公版教学谱"
              is_favorite={is_score_favorite(
                favorite_entries_state,
                get_repertoire_favorite_id(entry.id),
              )}
              on_toggle_favorite={handle_toggle_favorite}
              collapse_all_token={collapse_all_token}
              expand_all_token={expand_all_token}
            />
          ))}
        </div>
      </section>

      <section id="repertoire-hymns" className="repertoire-section" aria-label="诗歌练习">
        <div className="section-heading repertoire-section-heading">
          <div>
            <p className="section-kicker"><BookOpenText size={15} /> 诗歌练习</p>
            <h2>从熟悉诗歌进入手位、指法与和弦分析。</h2>
          </div>
          <p className="repertoire-section-count">{hymn_entries.length} 首</p>
        </div>
        <p className="repertoire-section-copy">
          这部分来自 <code>712首-文字</code> 的 SimpMusic PPTX。
          当前先作为 OOXML 待审核来源展示；发布 ScoreDocument v2 后才进入正式跟弹判定。
        </p>
        <div className="repertoire-list">
          {hymn_entries.map((entry, index) => (
            <StructuredRepertoireCard
              key={entry.id}
              entry={entry}
              index={index}
              badge_label="诗歌教学谱"
              is_favorite={is_score_favorite(
                favorite_entries_state,
                get_repertoire_favorite_id(entry.id),
              )}
              on_toggle_favorite={handle_toggle_favorite}
              collapse_all_token={collapse_all_token}
              expand_all_token={expand_all_token}
            />
          ))}
        </div>
      </section>

      <section id="repertoire-imported" className="repertoire-section" aria-label="授权教学版">
        <div className="section-heading repertoire-section-heading">
          <div>
            <p className="section-kicker"><BookOpenText size={15} /> 授权教学版</p>
          <h2>授权原谱已经完整整理成能直接练的整首版本。</h2>
          </div>
          <p className="repertoire-section-count">{imported_teaching_entries.length} 首</p>
        </div>
        <p className="repertoire-section-copy">
          这部分来自已授权导入原谱，但已经手工整理成结构化教学谱。
          当前 10 首导入曲目均已完成整首结构化，可直接进入练习。
        </p>
        <div className="repertoire-list">
          {imported_teaching_entries.map((entry, index) => (
            <StructuredRepertoireCard
              key={entry.id}
              entry={entry}
              index={index}
              badge_label="授权教学版"
              is_favorite={is_score_favorite(
                favorite_entries_state,
                get_repertoire_favorite_id(entry.id),
              )}
              on_toggle_favorite={handle_toggle_favorite}
              collapse_all_token={collapse_all_token}
              expand_all_token={expand_all_token}
            />
          ))}
        </div>
      </section>

      {imported_preview_entries.length > 0 && (
        <section className="repertoire-section" aria-label="授权导入原谱">
          <div className="section-heading repertoire-section-heading">
          <div>
            <p className="section-kicker"><ImageIcon size={15} /> 授权导入原谱</p>
            <h2>先把原谱放进曲库，再继续整理成可练习谱。</h2>
          </div>
          <p className="repertoire-section-count">{imported_preview_entries.length} 首</p>
        </div>
          <p className="repertoire-section-copy">
            这里保留待补充条目的原谱页图、页数和来源链接。
          </p>
          <div className="repertoire-list">
            {imported_preview_entries.map((entry, index) => (
              <ImportedJianpuCard
                key={entry.id}
                entry={entry}
                index={index}
                collapse_all_token={collapse_all_token}
                expand_all_token={expand_all_token}
              />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function StructuredRepertoireCard({
  entry,
  index,
  badge_label,
  is_favorite,
  on_toggle_favorite,
  collapse_all_token,
  expand_all_token,
}: {
  entry: repertoire_entry;
  index: number;
  badge_label: string;
  is_favorite: boolean;
  on_toggle_favorite: (entry: repertoire_entry) => void;
  collapse_all_token: number;
  expand_all_token: number;
}) {
  return (
    <article id={`repertoire-${entry.id}`} className="repertoire-card">
      <header>
        <span className="repertoire-number">{String(index + 1).padStart(2, "0")}</span>
        <div>
          <p className="section-kicker">{entry.level} · 建议 {entry.recommended_weeks}</p>
          <h2>{entry.title}</h2>
          <p>{entry.attribution}</p>
        </div>
        <div className="repertoire-card-header-actions">
          <span className="public-domain-badge">{badge_label}</span>
          <button
            type="button"
            className={`repertoire-favorite-toggle ${is_favorite ? "is-favorite" : ""}`}
            aria-pressed={is_favorite}
            aria-label={is_favorite ? `取消收藏${entry.title}` : `收藏${entry.title}`}
            onClick={() => on_toggle_favorite(entry)}
          >
            <Heart size={16} fill={is_favorite ? "currentColor" : "none"} />
          </button>
        </div>
      </header>
      <div className="repertoire-learning-goal">
        <BookOpenText size={16} />
        <div>
          <strong>本曲学什么</strong>
          <p>{entry.learning_goal}</p>
        </div>
      </div>
      <PracticeScore
        score={entry.score}
        collapse_all_token={collapse_all_token}
        expand_all_token={expand_all_token}
      />
      <footer>
        <p>{entry.rights_note}</p>
      </footer>
    </article>
  );
}

function create_repertoire_favorite(
  entry: repertoire_entry,
): Omit<score_favorite_entry, "updated_at"> {
  return {
    id: get_repertoire_favorite_id(entry.id),
    kind: "repertoire",
    title: entry.title,
    subtitle: `${entry.attribution} · ${entry.score.steps.length} 个跟弹步`,
    href: `/曲目#repertoire-${entry.id}`,
    source: entry.score.source.label,
  };
}

function get_repertoire_favorite_id(id: string): string {
  return `repertoire:${id}`;
}

function ImportedJianpuCard({
  entry,
  index,
  collapse_all_token,
  expand_all_token,
}: {
  entry: imported_jianpu_entry;
  index: number;
  collapse_all_token: number;
  expand_all_token: number;
}) {
  const [gallery_open, set_gallery_open] = useState(false);

  useEffect(() => {
    set_gallery_open(false);
  }, [collapse_all_token]);

  useEffect(() => {
    set_gallery_open(true);
  }, [expand_all_token]);

  return (
    <article className="repertoire-card imported-repertoire-card">
      <header>
        <span className="repertoire-number">J{String(index + 1).padStart(2, "0")}</span>
        <div>
          <p className="section-kicker">授权导入 · 共 {entry.page_count} 页</p>
          <h2>{entry.title}</h2>
          <p>{entry.attribution}</p>
        </div>
        <span className="public-domain-badge imported-repertoire-badge">原谱预览</span>
      </header>
      <div className="repertoire-learning-goal">
        <BookOpenText size={16} />
        <div>
          <strong>当前先做什么</strong>
          <p>先看原谱的旋律走向、分句和双手排布；后续会继续整理成可跟弹的教学谱。</p>
        </div>
      </div>
      <div className="imported-jianpu-preview">
        <div className="imported-jianpu-preview-copy">
          <div>
            <p className="section-kicker"><ImageIcon size={15} /> 原谱第一页</p>
            <h3>{entry.title}</h3>
          </div>
          <p>
            当前已成功采集 {entry.page_count} 页原谱截图，并同步进热门曲库。
            这一版先作为浏览、选曲和人工整理入口。
          </p>
          <a
            href={entry.preview_image.url}
            target="_blank"
            rel="noreferrer"
            className="material-reference-link"
          >
            查看第一页
          </a>
        </div>
        <a
          href={entry.preview_image.url}
          target="_blank"
          rel="noreferrer"
          className="imported-jianpu-preview-main"
          aria-label={entry.preview_image.alt}
        >
          <img
            className="imported-jianpu-preview-image"
            src={entry.preview_image.url}
            alt={entry.preview_image.alt}
            width={entry.preview_image.width}
            height={entry.preview_image.height}
            loading="lazy"
          />
        </a>
      </div>
      <details
        className="imported-jianpu-gallery"
        onToggle={(event) => set_gallery_open(event.currentTarget.open)}
      >
        <summary>
          <span><ImageIcon size={16} /> 展开查看全部 {entry.page_count} 页原谱</span>
            <small>用于来源核对与后续补充</small>
        </summary>
        {gallery_open && (
          <div className="imported-jianpu-gallery-grid">
            {entry.pages.map((page) => (
              <a
                key={page.url}
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="imported-jianpu-page"
                aria-label={`${entry.title} 第 ${page.index} 页`}
              >
                <img
                  src={page.url}
                  alt={`${entry.title} 第 ${page.index} 页`}
                  width={page.width}
                  height={page.height}
                  loading="lazy"
                />
                <span>第 {page.index} 页</span>
              </a>
            ))}
          </div>
        )}
      </details>
      <footer>
        <p>{entry.rights_note}</p>
      </footer>
    </article>
  );
}
