import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CircleAlert,
  FileSearch,
  LibraryBig,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { MaterialScoreViewer } from "@/features/assets/MaterialScoreViewer";
import { get_material_status_label } from "@/features/assets/policy";
import { load_material_catalog } from "@/features/assets/loadCatalog";
import { soft_delete_material_segment } from "@/features/materials/materialDeletion";
import { useCenteredActiveItem } from "@/hooks/useCenteredActiveItem";
import {
  apply_material_review_records,
  create_initial_material_review_records,
  load_material_review_records,
  material_review_change_event,
  material_review_storage_key,
} from "@/features/assets/reviewGate";
import type {
  material_catalog,
  material_collection,
  material_id,
  material_review_records,
  material_segment,
} from "@/features/assets/types";
import { use_auth_store } from "@/store/useAuthStore";

interface material_library_props {
  initial_catalog?: material_catalog;
}

export function MaterialLibrary({ initial_catalog }: material_library_props) {
  const { material_id: route_material_id, segment_id } = useParams();
  const navigate = useNavigate();
  const user = use_auth_store((state) => state.user);
  const [catalog, set_catalog] = useState(initial_catalog);
  const [load_error, set_load_error] = useState<string>();
  const [load_attempt, set_load_attempt] = useState(0);
  const [delete_message, set_delete_message] = useState<string>();
  const [deleting_segment_id, set_deleting_segment_id] = useState<string>();
  const [switching_direction, set_switching_direction] = useState<"previous" | "next">();
  const segment_list_ref = useRef<HTMLDivElement>(null);
  const [review_records, set_review_records] = useState<material_review_records>(
    create_initial_material_review_records,
  );
  useCenteredActiveItem(
    segment_list_ref,
    `${route_material_id ?? ""}:${segment_id ?? ""}:${catalog?.generated_at ?? ""}`,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refresh_review_records = () => set_review_records(load_material_review_records());
    const handle_storage = (event: StorageEvent) => {
      if (event.key === material_review_storage_key) {
        refresh_review_records();
      }
    };

    refresh_review_records();
    window.addEventListener(material_review_change_event, refresh_review_records);
    window.addEventListener("storage", handle_storage);

    return () => {
      window.removeEventListener(material_review_change_event, refresh_review_records);
      window.removeEventListener("storage", handle_storage);
    };
  }, []);

  useEffect(() => {
    if (initial_catalog) {
      return;
    }

    let active = true;
    set_catalog(undefined);
    set_load_error(undefined);
    void load_material_catalog()
      .then((loaded_catalog) => {
        if (active) {
          set_catalog(loaded_catalog);
        }
      })
      .catch(() => {
        if (active) {
          set_load_error("教材谱库加载失败，请稍后重试");
        }
      });

    return () => {
      active = false;
    };
  }, [initial_catalog, load_attempt]);

  if (load_error) {
    return (
      <AppShell>
        <section className="material-library-state is-error">
          <CircleAlert size={24} />
          <h1>教材谱库暂时不可用</h1>
          <p>{load_error}。原始教材与现有课程练习不受影响。</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => set_load_attempt((attempt) => attempt + 1)}
          >
            <RotateCcw size={17} />
            重新加载教材谱库
          </button>
        </section>
      </AppShell>
    );
  }

  if (!catalog) {
    return (
      <AppShell>
        <section className="material-library-state">
          <FileSearch size={24} />
          <h1>正在加载教材谱库</h1>
          <p>正在读取本地教材对照索引。</p>
        </section>
      </AppShell>
    );
  }

  const effective_catalog = apply_material_review_records(catalog, review_records);
  const selected_material = get_selected_material(effective_catalog, route_material_id);
  if (!selected_material) {
    return (
      <AppShell>
        <section className="material-library-state">
          <BookOpenText size={24} />
          <h1>教材内容正在整理</h1>
          <p>当前还没有可查看的教材原谱，课程中的原创练习仍可正常使用。</p>
        </section>
      </AppShell>
    );
  }

  const selected_segment = get_selected_segment(selected_material, segment_id);
  if (!selected_segment) {
    return (
      <AppShell>
        <section className="material-library-state">
          <BookOpenText size={24} />
          <h1>{selected_material.title}正在整理</h1>
          <p>这本教材暂时没有可查看的谱面片段，请稍后再来。</p>
          <Link to="/" className="text-link">继续今日练习 <ArrowRight size={16} /></Link>
        </section>
      </AppShell>
    );
  }
  const handle_delete_selected_segment = async () => {
    if (!selected_segment) {
      return;
    }
    if (typeof window !== "undefined" &&
      !window.confirm(`确认删除“${selected_segment.title}”？删除后会从教材谱库、简谱教材和校准台隐藏。`)) {
      return;
    }
    set_deleting_segment_id(selected_segment.id);
    set_delete_message(undefined);
    try {
      await soft_delete_material_segment(selected_segment.material_id, selected_segment.id);
      set_catalog((current) =>
        current ? remove_material_segment_from_catalog(current, selected_segment) : current);
      if (!initial_catalog) {
        set_catalog(await load_material_catalog());
      }
      set_delete_message("教材片段已删除，并已从所有教材入口隐藏。");
    } catch (error) {
      set_delete_message(error instanceof Error ? error.message : "教材片段删除失败。");
    } finally {
      set_deleting_segment_id(undefined);
    }
  };
  const segment_navigation = get_material_segment_navigation(selected_material, selected_segment);
  const handle_navigate_segment = (
    target_segment: material_segment,
    direction: "previous" | "next",
  ) => {
    set_switching_direction(direction);
    navigate(`/教材/${selected_material.id}/${target_segment.id}`);
    window.setTimeout(() => set_switching_direction(undefined), 360);
  };

  const total_segment_count = catalog.materials.reduce(
    (total, material) => total + material.segment_count,
    0,
  );

  return (
    <AppShell>
      <section className="page-intro material-library-intro">
        <div>
          <p className="eyebrow">本地教材原谱 · {total_segment_count} 个片段</p>
          <h1>教材谱库</h1>
          <p className="intro-copy">
            在这里查看拜厄和哈农的原谱整理结果，并和纸本教材逐页核对。
            完成核对前，这些谱例只用于查看，不参与练习判错。
          </p>
        </div>
        <div className="material-library-rule">
          <CircleAlert size={18} />
          <div>
            <strong>仅供核对</strong>
            <p>正式课程只使用已经整理并确认的练习内容。</p>
          </div>
        </div>
      </section>

      <div className="material-tabs" role="tablist" aria-label="教材选择">
        {catalog.materials.map((material) => (
          <Link
            key={material.id}
            to={get_material_route(material)}
            className={material.id === selected_material.id ? "is-selected" : ""}
            role="tab"
            aria-selected={material.id === selected_material.id}
          >
            <BookOpenText size={17} />
            <span>{material.title}</span>
            <small>{material.segment_count} 个片段</small>
          </Link>
        ))}
      </div>

      <section className="material-library-layout">
        <aside className="material-segment-panel" aria-label={`${selected_material.title}片段列表`}>
          <div className="material-segment-panel-head">
            <div>
              <p className="section-kicker"><LibraryBig size={15} /> 片段目录</p>
              <h2>{selected_material.title}</h2>
            </div>
            <span>{selected_material.page_count} 页</span>
          </div>
          <p>片段编号来自原谱解析顺序，不等同教材练习编号。</p>

          <div className="material-segment-list" ref={segment_list_ref}>
            {selected_material.segments.map((segment) => (
              <MaterialSegmentLink
                key={segment.id}
                material={selected_material}
                segment={segment}
                selected={segment.id === selected_segment.id}
              />
            ))}
          </div>
        </aside>

        <div className="material-library-score">
          {delete_message && (
            <p className="material-library-message">{delete_message}</p>
          )}
          <MaterialScoreViewer
            segment={selected_segment}
            on_delete_segment={user?.role === "admin"
              ? handle_delete_selected_segment
              : undefined}
            is_deleting={deleting_segment_id === selected_segment.id}
            navigation={{
              previous_segment: segment_navigation.previous_segment,
              next_segment: segment_navigation.next_segment,
              current_index: segment_navigation.current_index,
              total_count: segment_navigation.total_count,
              switching_direction,
              on_navigate: handle_navigate_segment,
            }}
          />
        </div>
      </section>
    </AppShell>
  );
}

function remove_material_segment_from_catalog(
  catalog: material_catalog,
  removed_segment: material_segment,
): material_catalog {
  return {
    ...catalog,
    materials: catalog.materials
      .map((material) => {
        if (material.id !== removed_segment.material_id) {
          return material;
        }
        const segments = material.segments.filter((segment) =>
          segment.id !== removed_segment.id);
        return {
          ...material,
          segment_count: segments.length,
          segments,
        };
      })
      .filter((material) => material.segments.length > 0),
  };
}

function MaterialSegmentLink({
  material,
  segment,
  selected,
}: {
  material: material_collection;
  segment: material_segment;
  selected: boolean;
}) {
  return (
    <Link
      to={`/教材/${material.id}/${segment.id}`}
      className={`material-segment-link ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
    >
      <span className="material-segment-sequence">{String(segment.sequence).padStart(3, "0")}</span>
      <span className="material-segment-copy">
        <strong>{get_segment_label(segment)}</strong>
        <small><MapPin size={12} /> {get_source_page_label(segment.source_page_label)}</small>
        <em className={`material-segment-status status-${segment.status}`}>
          {get_material_status_label(segment.status)}
        </em>
      </span>
      <ArrowRight size={15} />
    </Link>
  );
}

function get_selected_material(
  catalog: material_catalog,
  requested_material_id: string | undefined,
): material_collection | undefined {
  const material_id = is_material_id(requested_material_id) ? requested_material_id : "beyer";
  return catalog.materials.find((material) => material.id === material_id) ?? catalog.materials[0];
}

function get_selected_segment(
  material: material_collection,
  requested_segment_id: string | undefined,
): material_segment | undefined {
  return material.segments.find((segment) => segment.id === requested_segment_id) ?? material.segments[0];
}

function get_material_segment_navigation(
  material: material_collection,
  segment: material_segment,
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

function get_material_route(material: material_collection): string {
  const first_segment = material.segments[0];
  return first_segment ? `/教材/${material.id}/${first_segment.id}` : "/教材";
}

function get_segment_label(segment: material_segment): string {
  const exercise_numbers = segment.ocr_exercise_numbers;
  if (exercise_numbers.length > 0) {
    return `识别标签：练习 ${exercise_numbers.join("、")}`;
  }
  return `片段 ${String(segment.sequence).padStart(3, "0")}`;
}

function get_source_page_label(label: string): string {
  return label.replace(/^PDF /, "原谱");
}

function is_material_id(value: string | undefined): value is material_id {
  return (
    value === "beyer" ||
    value === "hanon" ||
    value === "john-thompson-easiest-1" ||
    value === "john-thompson-easiest-2"
  );
}
