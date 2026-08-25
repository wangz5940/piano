import { useEffect, useState } from "react";
import { ArrowRight, Heart, Music2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import {
  load_score_favorites,
  remove_score_favorite,
  save_score_favorites,
  type score_favorite_entry,
} from "@/features/repertoire/favorites";

const favorite_kind_labels: Record<score_favorite_entry["kind"], string> = {
  practice: "课程练习",
  repertoire: "热门曲目",
  material: "教材谱库",
  jianpu: "简谱教材",
  calibration: "校准谱",
};

export function Favorites() {
  const [favorites, set_favorites] = useState<score_favorite_entry[]>(
    load_score_favorites,
  );

  useEffect(() => {
    save_score_favorites(favorites);
  }, [favorites]);

  const remove_favorite = (id: string) => {
    set_favorites((entries) => remove_score_favorite(entries, id));
  };

  return (
    <AppShell>
      <section className="page-intro favorites-intro">
        <div>
          <p className="eyebrow"><Heart size={15} /> 收藏</p>
          <h1>常用曲谱，<br />集中回到同一个入口。</h1>
          <p className="intro-copy">
            收藏列表会保存教材谱库、简谱教材、热门曲目和校准后的曲谱入口。
            校准保存成功的谱默认加入这里。
          </p>
        </div>
        <div className="favorites-summary">
          <strong>{favorites.length}</strong>
          <span>首收藏曲谱</span>
        </div>
      </section>

      {favorites.length > 0 ? (
        <section className="favorites-list" aria-label="收藏曲谱列表">
          {favorites.map((favorite) => (
            <article key={favorite.id} className="favorite-score-card">
              <div className="favorite-score-main">
                <span className="favorite-score-kind">
                  {favorite_kind_labels[favorite.kind]}
                </span>
                <h2>{favorite.title}</h2>
                <p>{favorite.subtitle}</p>
                <small>{favorite.source}</small>
              </div>
              <div className="favorite-score-actions">
                <button
                  type="button"
                  className="repertoire-favorite-toggle is-favorite"
                  aria-label={`取消收藏${favorite.title}`}
                  onClick={() => remove_favorite(favorite.id)}
                >
                  <Trash2 size={15} />
                </button>
                <Link to={favorite.href} className="favorite-score-link">
                  打开 <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="favorites-empty" aria-label="暂无收藏">
          <Music2 size={26} />
          <h2>还没有收藏曲谱</h2>
          <p>在教材谱库、简谱教材或热门曲目中点击心形按钮即可加入收藏。</p>
          <Link to="/曲目" className="text-link">
            去热门曲目看看 <ArrowRight size={16} />
          </Link>
        </section>
      )}
    </AppShell>
  );
}
