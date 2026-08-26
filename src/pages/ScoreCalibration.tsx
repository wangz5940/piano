import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  FileMusic,
  FolderOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { api_request } from "@/features/api/client";
import { CalibrationPreview } from "@/features/calibration/CalibrationPreview";
import type { calibration_preview_mode } from "@/features/calibration/CalibrationPreview";
import {
  all_calibration_fields,
  default_primary_calibration_fields,
  move_calibration_field,
  type calibration_field,
} from "@/features/calibration/calibrationFieldOrder";
import { play_calibration_measure } from "@/features/calibration/playback";
import {
  load_calibration_projects,
  remove_calibration_project,
  save_calibration_projects,
} from "@/features/calibration/storage";
import {
  calibration_levels,
  type calibration_event_metadata,
  type calibration_issue,
  type calibration_level,
  type calibration_project,
  type golden_score_export,
} from "@/features/calibration/types";
import {
  can_complete_calibration_level,
  validate_calibration_project,
} from "@/features/calibration/validation";
import { duration_beats_from_digit_key } from "@/features/calibration/keyboardShortcuts";
import {
  beats_to_duration_label,
  apply_slur_marking,
  build_notation_sync_map,
  midi_to_pitch_name,
  synchronize_notation_change,
  synchronize_project_notation_metadata,
} from "@/features/calibration/notationSync";
import { clear_material_asset_cache } from "@/features/assets/loadCatalog";
import type {
  account_user,
  score_document_event,
} from "@/features/auth/types";
import {
  clear_jianpu_library_cache,
  load_jianpu_catalog,
  load_jianpu_score,
} from "@/features/jianpu/loadJianpuLibrary";
import {
  get_beyer_title_annotation_for_pages,
  type beyer_title_annotation_summary,
} from "@/features/jianpu/beyerTitleAnnotations";
import {
  load_score_favorites,
  save_score_favorites,
  upsert_score_favorite,
  type score_favorite_entry,
} from "@/features/repertoire/favorites";
import { soft_delete_material_segment } from "@/features/materials/materialDeletion";
import { useCenteredActiveItem } from "@/hooks/useCenteredActiveItem";
import type {
  jianpu_catalog,
  jianpu_material,
  jianpu_score,
  jianpu_segment,
} from "@/features/jianpu/types";
import type {
  score_document,
  score_document_note,
} from "@/features/score";
import { create_manual_fingering_annotation } from "@/features/score";
import { use_app_settings_store } from "@/store/useAppSettingsStore";
import { use_auth_store } from "@/store/useAuthStore";

interface score_calibration_props {
  user_override?: account_user | null;
  initial_projects?: calibration_project[];
}

type calibration_score_scale_mode = "fit" | "width" | "actual";
type calibration_inspector_layout = "bottom" | "side" | "hidden";

function publish_calibration_project(
  project: calibration_project,
  published_by: string,
  published_at = new Date().toISOString(),
): calibration_project {
  const next_project = structuredClone(project);
  next_project.document = publish_score_document(
    next_project.document,
    published_by,
    published_at,
  );
  next_project.updated_at = published_at;
  return next_project;
}

function publish_score_document(
  document: score_document,
  published_by: string,
  published_at = new Date().toISOString(),
): score_document {
  document.status = "published";
  document.review = {
    ...document.review,
    published_by: document.review.published_by ?? published_by,
    published_at: document.review.published_at ?? published_at,
  };
  document.measures.forEach((measure) => {
    measure.events.forEach((event) => {
      event.notes.forEach((note) => {
        if (note.fingering) {
          note.fingering.status = "published";
        }
      });
    });
  });
  return document;
}

const score_preview_natural_width = 1120;

const level_copy: Record<
  calibration_level,
  { title: string; copy: string }
> = {
  L0: { title: "内容结构", copy: "已有来源、谱表与小节" },
  L1: { title: "视觉符号", copy: "音高、时值、声部与记号" },
  L2: { title: "音乐逻辑", copy: "拍号、时值闭合、连音与和弦" },
  L3: { title: "教学数据", copy: "手别、指法、手位与训练目标" },
};

export function ScoreCalibration({
  user_override,
  initial_projects,
}: score_calibration_props = {}) {
  const [search_params] = useSearchParams();
  const stored_user = use_auth_store((state) => state.user);
  const auth_status = use_auth_store((state) => state.status);
  const user = user_override === undefined ? stored_user : user_override ?? undefined;
  const [projects, set_projects] = useState<calibration_project[]>(() => {
    const candidates = initial_projects ??
      (typeof window === "undefined"
        ? []
        : load_calibration_projects(window.localStorage));
    return candidates.map((candidate) =>
      synchronize_project_notation_metadata(structuredClone(candidate)));
  });
  const [selected_project_id, set_selected_project_id] = useState(
    () => projects[0]?.id ?? "",
  );
  const [preview_mode, set_preview_mode] =
    useState<calibration_preview_mode>("staff");
  const [catalog, set_catalog] = useState<jianpu_catalog>();
  const [is_loading_catalog, set_is_loading_catalog] = useState(false);
  const [selected_segment_key, set_selected_segment_key] = useState("");
  const [selected_measure_id, set_selected_measure_id] = useState("");
  const [selected_event_id, set_selected_event_id] = useState("");
  const [selected_note_id, set_selected_note_id] = useState("");
  const [is_segment_panel_collapsed, set_is_segment_panel_collapsed] =
    useState(false);
  const [is_source_panel_collapsed, set_is_source_panel_collapsed] =
    useState(false);
  const [score_scale_mode, set_score_scale_mode] =
    useState<calibration_score_scale_mode>("fit");
  const [inspector_layout, set_inspector_layout] =
    useState<calibration_inspector_layout>("bottom");
  const [is_saving, set_is_saving] = useState(false);
  const [score_viewport_size, set_score_viewport_size] = useState({
    width: score_preview_natural_width,
    height: 640,
  });
  const [score_content_height, set_score_content_height] = useState(1);
  const [message, set_message] = useState<string>();
  const [data_json_error, set_data_json_error] = useState<string>();
  const [deleting_material_segment_id, set_deleting_material_segment_id] = useState<string>();
  const requested_segment_key = search_params.get("segment") ?? "";
  const stop_playback_ref = useRef<(() => void) | null>(null);
  const workbench_ref = useRef<HTMLElement>(null);
  const score_stage_ref = useRef<HTMLDivElement>(null);
  const score_content_ref = useRef<HTMLDivElement>(null);
  const project_list_ref = useRef<HTMLDivElement>(null);
  const segment_options = useMemo(
    () => catalog?.materials.flatMap((material) =>
      material.segments.map((segment) => ({ material, segment }))) ?? [],
    [catalog],
  );
  const calibrated_title_by_segment_key = useMemo(() => {
    const titles = new Map<string, string>();
    for (const candidate of projects) {
      const material_id = candidate.material_catalog?.material_id;
      const segment_id = get_project_segment_id(candidate);
      const title = candidate.title.trim();
      if (material_id && segment_id && title) {
        titles.set(`${material_id}:${segment_id}`, title);
      }
    }
    return titles;
  }, [projects]);
  const project = projects.find((candidate) =>
    candidate.id === selected_project_id) ?? projects[0];
  useCenteredActiveItem(
    project_list_ref,
    [
      project?.id ?? "",
      selected_segment_key,
      String(segment_options.length),
      String(is_segment_panel_collapsed),
    ].join(":"),
  );

  useEffect(() => {
    if (!project) {
      return;
    }
    const first_measure = project.document.measures[0];
    const selected_measure = project.document.measures.find((measure) =>
      measure.id === selected_measure_id) ?? first_measure;
    const first_event = selected_measure?.events[0];
    const selected_event = selected_measure?.events.find((event) =>
      event.id === selected_event_id) ?? first_event;
    const selected_note = selected_event?.notes.find((note) =>
      note.id === selected_note_id) ?? selected_event?.notes[0];
    set_selected_measure_id(selected_measure?.id ?? "");
    set_selected_event_id(selected_event?.id ?? "");
    set_selected_note_id(selected_note?.id ?? "");
  }, [
    project,
    selected_event_id,
    selected_measure_id,
    selected_note_id,
  ]);

  useEffect(() => () => {
    stop_playback_ref.current?.();
  }, []);

  useEffect(() => {
    score_stage_ref.current?.scrollTo({ top: 0, left: 0 });
  }, [project?.id]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const stage = score_stage_ref.current;
    if (!stage) {
      return;
    }
    const update = () => {
      set_score_viewport_size({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [project?.id, preview_mode, inspector_layout, is_source_panel_collapsed]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const content = score_content_ref.current;
    if (!content) {
      return;
    }
    const update = () => {
      set_score_content_height(Math.max(1, content.scrollHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    return () => observer.disconnect();
  }, [project?.id, preview_mode, score_scale_mode, score_viewport_size.width]);

  useEffect(() => {
    if (initial_projects || user?.role !== "admin") {
      return;
    }
    let active = true;
    set_is_loading_catalog(true);
    void load_jianpu_catalog()
      .then((next_catalog) => {
        if (!active) {
          return;
        }
        set_catalog(next_catalog);
        const first_segment = next_catalog.materials
          .flatMap((material) => material.segments.map((segment) => ({
            material,
            segment,
          })))[0];
        const requested_segment = next_catalog.materials
          .flatMap((material) => material.segments.map((segment) => ({
            material,
            segment,
          })))
          .find(({ material, segment }) =>
            get_segment_key(material, segment) === requested_segment_key);
        if (first_segment) {
          set_selected_segment_key((current) =>
            current ||
            (requested_segment
              ? get_segment_key(requested_segment.material, requested_segment.segment)
              : get_segment_key(first_segment.material, first_segment.segment)));
        }
        set_message(undefined);
      })
      .catch((error: unknown) => {
        if (active) {
          set_message(error instanceof Error
            ? error.message
            : "教材谱库读取失败。");
        }
      })
      .finally(() => {
        if (active) {
          set_is_loading_catalog(false);
        }
      });
    return () => {
      active = false;
    };
  }, [initial_projects, requested_segment_key, user?.role]);

  useEffect(() => {
    if (!requested_segment_key || segment_options.length === 0) {
      return;
    }
    if (segment_options.some(({ material, segment }) =>
      get_segment_key(material, segment) === requested_segment_key)) {
      set_selected_segment_key(requested_segment_key);
    }
  }, [requested_segment_key, segment_options]);

  useEffect(() => {
    if (initial_projects || !selected_segment_key || segment_options.length === 0) {
      return;
    }
    const selected = segment_options.find(({ material, segment }) =>
      get_segment_key(material, segment) === selected_segment_key);
    if (!selected) {
      return;
    }
    const project_id = get_material_project_id(selected.material, selected.segment);
    const saved_project = projects.find((candidate) => candidate.id === project_id);
    if (saved_project) {
      set_selected_project_id(project_id);
      return;
    }
    let active = true;
    set_is_loading_catalog(true);
    void load_jianpu_score(selected.segment.jianpu_url)
      .then((score) => {
        if (!active) {
          return;
        }
        const next_project = project_from_jianpu_segment(
          selected.material,
          selected.segment,
          score,
        );
        set_projects((current) => merge_material_projects(current, [next_project]));
        set_selected_project_id(next_project.id);
        set_preview_mode("jianpu");
        set_message(undefined);
      })
      .catch((error: unknown) => {
        if (active) {
          set_message(error instanceof Error
            ? error.message
            : "教材片段加载失败。");
        }
      })
      .finally(() => {
        if (active) {
          set_is_loading_catalog(false);
        }
      });
    return () => {
      active = false;
    };
  }, [initial_projects, projects, selected_segment_key, segment_options]);

  if (!user) {
    return (
      <AppShell>
        <CalibrationState
          icon={<ShieldCheck size={24} />}
          title={auth_status === "loading" ? "正在确认账号权限" : "请先登录管理员账号"}
          copy="校准项目包含未发布乐谱和本地原件，只向管理员开放。"
        >
          <Link to="/账号" className="primary-button">
            前往登录 <ArrowRight size={17} />
          </Link>
        </CalibrationState>
      </AppShell>
    );
  }
  if (user.role !== "admin") {
    return (
      <AppShell>
        <CalibrationState
          icon={<CircleAlert size={24} />}
          title="当前账号没有乐谱校准权限"
          copy="请使用管理员账号进入校准台。"
        />
      </AppShell>
    );
  }
  if (!project) {
    return (
      <AppShell>
        <CalibrationState
          icon={<FileMusic size={24} />}
          title={is_loading_catalog ? "正在读取教材谱库" : "还没有可校准的教材谱"}
          copy={is_loading_catalog
            ? "校准台正在载入当前教材谱库中的片段。"
            : "当前教材谱库没有可用片段，请检查简谱教材目录。"}
        />
      </AppShell>
    );
  }

  const validation = validate_calibration_project(project);
  const notation_mappings = build_notation_sync_map(project);
  const score_preview_width = score_scale_mode === "width"
    ? Math.max(360, score_viewport_size.width - 28)
    : score_preview_natural_width;
  const score_fit_scale = Math.min(
    1,
    Math.max(0.55, Math.min(
      (score_viewport_size.width - 28) / score_preview_width,
      (score_viewport_size.height - 28) / score_content_height,
    )),
  );
  const score_scale = score_scale_mode === "fit" ? score_fit_scale : 1;
  const score_stage_style = {
    "--score-preview-width": `${score_preview_width}px`,
    "--score-scale": String(score_scale),
    "--score-scaled-width": `${score_preview_width * score_scale}px`,
    "--score-scaled-height": `${score_content_height * score_scale}px`,
  } as CSSProperties;
  const selected_measure = project.document.measures.find((measure) =>
    measure.id === selected_measure_id) ?? project.document.measures[0];
  const selected_event = selected_measure?.events.find((event) =>
    event.id === selected_event_id) ?? selected_measure?.events[0];
  const selected_note = selected_event?.notes.find((note) =>
    note.id === selected_note_id) ?? selected_event?.notes[0];
  const selected_metadata = selected_event
    ? project.event_metadata[selected_event.id] ??
      create_event_metadata(selected_event)
    : undefined;

  const update_project = (
    update: (next: calibration_project) => void,
  ) => {
    set_projects((current) => current.map((candidate) => {
      if (candidate.id !== project.id) {
        return candidate;
      }
      const next = structuredClone(candidate);
      update(next);
      synchronize_project_notation_metadata(next);
      next.updated_at = new Date().toISOString();
      return next;
    }));
  };

  const update_score_signature = (
    key_signature?: string,
    time_signature?: string,
  ) => {
    try {
      const next = synchronize_notation_change(project, {
        origin: "staff",
        kind: "signature",
        key_signature,
        time_signature,
      });
      invalidate_calibration_levels(next, "L1");
      set_projects((current) => current.map((candidate) =>
        candidate.id === project.id ? next : candidate));
      set_message(
        time_signature === undefined
          ? "调号已同步到简谱与五线谱。"
          : "拍号已同步到全部小节、简谱与五线谱。",
      );
    } catch (error) {
      set_message(error instanceof Error ? error.message : "谱号同步失败。");
    }
  };

  const update_project_title = (title: string) => {
    const normalized_title = title.trim();
    if (!normalized_title) {
      set_message("作品标题不能为空。");
      return;
    }
    update_project((next) => {
      next.title = normalized_title;
      next.document.title = normalized_title;
    });
    set_catalog((current) => {
      if (!current) {
        return current;
      }
      const material_id = project.material_catalog?.material_id;
      const segment_id = get_project_segment_id(project);
      if (!material_id || !segment_id) {
        return current;
      }
      return {
        ...current,
        materials: current.materials.map((material) => {
          if (material.id !== material_id) {
            return material;
          }
          return {
            ...material,
            segments: material.segments.map((segment) => ({
              ...segment,
              title: segment.id === segment_id ? normalized_title : segment.title,
              page_slices: segment.page_slices.map((slice) => ({
                ...slice,
                title: segment.id === segment_id ? normalized_title : slice.title,
              })),
            })),
          };
        }),
      };
    });
    set_message("作品标题已更新，并同步到当前教材片段列表。");
  };

  const save_to_database = async () => {
    if (data_json_error) {
      set_message(data_json_error);
      return;
    }
    set_is_saving(true);
    try {
      const project_to_save = publish_calibration_project(
        project,
        user?.id ?? "calibration-workbench",
      );
      const response = await api_request<{
        calibration: { updated_at: string };
        original_sync: {
          sync_state: "synced" | "skipped";
          original_data_sha256?: string;
        };
      }>("/api/v1/admin/calibrations", {
        method: "POST",
        body: {
          project: project_to_save,
          validation,
        },
      });
      clear_jianpu_library_cache();
      clear_material_asset_cache();
      const next_projects = projects.map((candidate) =>
        candidate.id === project_to_save.id ? project_to_save : candidate);
      set_projects(next_projects);
      try {
        save_calibration_projects(next_projects, window.localStorage);
        save_score_favorites(upsert_score_favorite(
          load_score_favorites(),
          create_calibration_favorite(project_to_save),
        ));
      } catch {
        // Database persistence is authoritative; localStorage is only a reload cache.
      }
      set_message(
        response.original_sync.sync_state === "synced"
          ? "校准数据已保存到数据库，并已同步更新教材原始数据。"
          : "校准数据已保存到数据库，当前教材原始数据未回写。",
      );
    } catch (error) {
      set_message(error instanceof Error ? error.message : "校准数据保存失败。");
    } finally {
      set_is_saving(false);
    }
  };

  const delete_project = () => {
    const next = remove_calibration_project(projects, project.id);
    set_projects(next);
    set_selected_project_id(next[0]?.id ?? "");
  };

  const delete_material_segment = async () => {
    const material_id = project.material_catalog?.material_id;
    const segment_id = get_project_segment_id(project);
    if (!material_id || !segment_id) {
      set_message("当前校准项目未关联教材片段，不能删除教材。");
      return;
    }
    if (typeof window !== "undefined" &&
      !window.confirm(`确认删除“${project.title}”？删除后会从教材谱库、简谱教材和校准台隐藏。`)) {
      return;
    }
    set_deleting_material_segment_id(segment_id);
    try {
      await soft_delete_material_segment(material_id, segment_id);
      const next_catalog = await load_jianpu_catalog();
      set_catalog(next_catalog);
      set_projects((current) => current.filter((candidate) =>
        candidate.id !== `material:${material_id}:${segment_id}`));
      const next_segment = next_catalog.materials
        .flatMap((material) =>
          material.segments.map((segment) => ({ material, segment })))[0];
      set_selected_segment_key(next_segment
        ? get_segment_key(next_segment.material, next_segment.segment)
        : "");
      set_selected_project_id("");
      set_message("教材片段已删除，并已从教材谱库、简谱教材和校准台隐藏。");
    } catch (error) {
      set_message(error instanceof Error ? error.message : "教材片段删除失败。");
    } finally {
      set_deleting_material_segment_id(undefined);
    }
  };

  const set_level_status = (level: calibration_level) => {
    if (!can_complete_calibration_level(project, level, validation)) {
      set_message(`${level} 尚有错误或前置等级未通过。`);
      return;
    }
    update_project((next) => {
      const passed = next.levels[level].status === "passed";
      next.levels[level] = {
        status: passed ? "in_progress" : "passed",
        confirmed_at: passed ? null : new Date().toISOString(),
      };
    });
    set_message(`${level} 状态已更新。`);
  };

  const update_selected_event = (
    update: (
      event: score_document_event,
      metadata: calibration_event_metadata,
    ) => void,
  ) => {
    if (!selected_event) {
      return;
    }
    update_project((next) => {
      const event = next.document.measures
        .flatMap((measure) => measure.events)
        .find((candidate) => candidate.id === selected_event.id);
      if (!event) {
        return;
      }
      const metadata = next.event_metadata[event.id] ??
        create_event_metadata(event);
      next.event_metadata[event.id] = metadata;
      update(event, metadata);
      invalidate_calibration_levels(next, "L1");
    });
  };

  const update_selected_slur = (
    slur: calibration_event_metadata["slur"],
  ) => {
    if (!selected_event) {
      return;
    }
    try {
      let paired_start_event_id: string | undefined;
      let continued_count = 0;
      update_project((next) => {
        const result = apply_slur_marking(next, selected_event.id, slur);
        paired_start_event_id = result.paired_start_event_id;
        continued_count = result.continued_event_ids.length;
        invalidate_calibration_levels(next, "L1");
      });
      if (slur === "stop") {
        set_message(
          paired_start_event_id
            ? `Slur 已连接到 ${paired_start_event_id}，中间 ${continued_count} 个同声部事件设为延续。`
            : "已标记 Slur 结束，但未找到前方同手别、同声部的开始事件。",
        );
      } else if (slur === "start") {
        set_message("Slur 开始已标记；请选择后续同声部音符并设为结束。");
      } else {
        set_message("Slur 标记已更新。");
      }
    } catch (error) {
      set_message(error instanceof Error ? error.message : "Slur 标记更新失败。");
    }
  };

  const select_measure = (measure_id: string) => {
    const measure = project.document.measures.find((candidate) =>
      candidate.id === measure_id);
    set_selected_measure_id(measure_id);
    set_selected_event_id(measure?.events[0]?.id ?? "");
    set_selected_note_id(measure?.events[0]?.notes[0]?.id ?? "");
  };

  const select_event = (event_id: string) => {
    const event = selected_measure?.events.find((candidate) =>
      candidate.id === event_id);
    set_selected_event_id(event_id);
    set_selected_note_id(event?.notes[0]?.id ?? "");
  };

  const select_event_from_preview = (event_id: string) => {
    const measure = project.document.measures.find((candidate) =>
      candidate.events.some((event) => event.id === event_id));
    const event = measure?.events.find((candidate) => candidate.id === event_id);
    if (!measure || !event) {
      return;
    }
    set_selected_measure_id(measure.id);
    set_selected_event_id(event.id);
    set_selected_note_id(event.notes[0]?.id ?? "");
    workbench_ref.current?.focus();
  };

  const handle_calibration_keydown = (
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (is_text_input_target(event.target)) {
      return;
    }
    if (!selected_event) {
      return;
    }
    const duration_beats = event.metaKey || event.ctrlKey || event.altKey
      ? undefined
      : duration_beats_from_digit_key(event.key);
    if (duration_beats !== undefined) {
      event.preventDefault();
      update_selected_event((score_event, event_metadata) => {
        score_event.duration_beats = duration_beats;
        event_metadata.duration_label = beats_to_duration_label(duration_beats);
      });
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!selected_note) {
        return;
      }
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 1 : -1;
      update_selected_event((score_event, event_metadata) => {
        const note = score_event.notes.find((candidate) =>
          candidate.id === selected_note.id);
        if (!note) {
          return;
        }
        note.midi = clamp(note.midi + delta, 21, 108);
        event_metadata.pitch_name =
          score_event.notes.map((candidate) => midi_to_pitch_name(candidate.midi)).join(" / ");
      });
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 0.25 : -0.25;
      update_selected_event((score_event, event_metadata) => {
        score_event.duration_beats = Math.max(0.125, score_event.duration_beats + delta);
        event_metadata.duration_label =
          beats_to_duration_label(score_event.duration_beats);
      });
      return;
    }
    if (event.key.toLowerCase() === "f") {
      if (!selected_note) {
        return;
      }
      event.preventDefault();
      update_selected_event((score_event) => {
        const note = score_event.notes.find((candidate) =>
          candidate.id === selected_note.id);
        if (!note) {
          return;
        }
        const next_finger = note.finger === undefined
          ? 1
          : note.finger >= 5
            ? undefined
            : note.finger + 1;
        if (next_finger === undefined) {
          delete note.finger;
          delete note.fingering;
        } else {
          note.finger = next_finger as 1 | 2 | 3 | 4 | 5;
          note.fingering = create_manual_fingering_annotation(
            "校准台快捷键 F 设置指法。",
            note.source_refs,
          );
        }
      });
      return;
    }
    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      update_selected_event((score_event) => {
        score_event.tie = next_tie_value(score_event.tie);
      });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!selected_note) {
        return;
      }
      event.preventDefault();
      remove_note();
    }
  };

  const add_measure = () => {
    const measure_id = unique_id(`${project.document.id}-measure`);
    update_project((next) => {
      const previous = next.document.measures.at(-1);
      next.document.measures.push({
        id: measure_id,
        number: String(next.document.measures.length + 1),
        meter: previous?.meter ?? { beats: 4, beat_unit: 4 },
        events: [],
      });
      invalidate_calibration_levels(next, "L0");
    });
    set_selected_measure_id(measure_id);
    set_selected_event_id("");
    set_selected_note_id("");
  };

  const remove_measure = () => {
    if (!selected_measure) {
      return;
    }
    const measure_index = project.document.measures.findIndex((measure) =>
      measure.id === selected_measure.id);
    const fallback = project.document.measures[
      Math.max(0, measure_index - 1)
    ];
    update_project((next) => {
      const removed_event_ids = new Set(
        next.document.measures
          .find((measure) => measure.id === selected_measure.id)
          ?.events.map((event) => event.id) ?? [],
      );
      next.document.measures = next.document.measures.filter((measure) =>
        measure.id !== selected_measure.id);
      removed_event_ids.forEach((event_id) => {
        delete next.event_metadata[event_id];
      });
      invalidate_calibration_levels(next, "L0");
    });
    set_selected_measure_id(fallback?.id ?? "");
    set_selected_event_id(fallback?.events[0]?.id ?? "");
    set_selected_note_id(fallback?.events[0]?.notes[0]?.id ?? "");
  };

  const update_selected_measure = (
    update: (measure: calibration_project["document"]["measures"][number]) => void,
  ) => {
    if (!selected_measure) {
      return;
    }
    update_project((next) => {
      const measure = next.document.measures.find((candidate) =>
        candidate.id === selected_measure.id);
      if (measure) {
        update(measure);
        invalidate_calibration_levels(next, "L0");
      }
    });
  };

  const add_event = () => {
    if (!selected_measure) {
      return;
    }
    const event_id = unique_id(`${selected_measure.id}-event`);
    const note_id = unique_id(`${event_id}-note`);
    update_project((next) => {
      const measure = next.document.measures.find((candidate) =>
        candidate.id === selected_measure.id);
      if (!measure) {
        return;
      }
      const previous = measure.events.at(-1);
      const event: score_document_event = {
        id: event_id,
        onset_beats: previous
          ? previous.onset_beats + previous.duration_beats
          : 0,
        duration_beats: 1,
        hand: previous?.hand ?? "right",
        voice: previous?.voice ?? 1,
        notes: [{
          id: note_id,
          midi: previous?.notes[0]?.midi ?? next.document.tonic_midi,
          source_refs: [],
        }],
        source_refs: [],
      };
      measure.events.push(event);
      next.event_metadata[event.id] = create_event_metadata(event);
      invalidate_calibration_levels(next, "L1");
    });
    set_selected_event_id(event_id);
    set_selected_note_id(note_id);
  };

  const remove_event = () => {
    if (!selected_measure || !selected_event) {
      return;
    }
    const event_index = selected_measure.events.findIndex((event) =>
      event.id === selected_event.id);
    const fallback = selected_measure.events[Math.max(0, event_index - 1)];
    update_project((next) => {
      const measure = next.document.measures.find((candidate) =>
        candidate.id === selected_measure.id);
      if (measure) {
        measure.events = measure.events.filter((event) =>
          event.id !== selected_event.id);
      }
      delete next.event_metadata[selected_event.id];
      invalidate_calibration_levels(next, "L1");
    });
    set_selected_event_id(fallback?.id ?? "");
    set_selected_note_id(fallback?.notes[0]?.id ?? "");
  };

  const add_note = () => {
    if (!selected_event) {
      return;
    }
    const note_id = unique_id(`${selected_event.id}-note`);
    update_selected_event((event) => {
      const note = {
        id: note_id,
        midi: selected_note?.midi ?? event.notes.at(-1)?.midi ?? project.document.tonic_midi,
        source_refs: [],
      };
      const selected_note_index = selected_note
        ? event.notes.findIndex((candidate) => candidate.id === selected_note.id)
        : -1;
      if (selected_note_index >= 0) {
        event.notes.splice(selected_note_index + 1, 0, note);
      } else {
        event.notes.push(note);
      }
    });
    set_selected_note_id(note_id);
  };

  const remove_note = () => {
    if (!selected_note) {
      return;
    }
    update_selected_event((event) => {
      event.notes = event.notes.filter((note) => note.id !== selected_note.id);
    });
    const fallback = selected_event?.notes.find((note) =>
      note.id !== selected_note.id);
    set_selected_note_id(fallback?.id ?? "");
  };

  const play_measure = async () => {
    if (!selected_measure) {
      return;
    }
    try {
      stop_playback_ref.current?.();
      stop_playback_ref.current = await play_calibration_measure(selected_measure);
      set_message(`正在试听第 ${selected_measure.number} 小节。`);
    } catch (error) {
      set_message(error instanceof Error ? error.message : "当前小节无法试听。");
    }
  };

  const stop_playback = () => {
    stop_playback_ref.current?.();
    stop_playback_ref.current = null;
    set_message("试听已停止。");
  };

  const update_selected_pitch_names = (value: string) => {
    if (!selected_event) {
      return;
    }
    try {
      const next = synchronize_notation_change(project, {
        origin: preview_mode === "staff" ? "staff" : "jianpu",
        kind: "pitch_names",
        event_id: selected_event.id,
        pitch_names: value,
      });
      invalidate_calibration_levels(next, "L1");
      set_projects((current) => current.map((candidate) =>
        candidate.id === project.id ? next : candidate));
      const synchronized_event = next.document.measures
        .flatMap((measure) => measure.events)
        .find((event) => event.id === selected_event.id);
      set_selected_note_id(synchronized_event?.notes[0]?.id ?? "");
      set_message("音高已同步到简谱与五线谱。");
    } catch (error) {
      set_message(error instanceof Error ? error.message : "音名格式无效。");
    }
  };

  const replace_document_from_json = (document: score_document) => {
    const next_project = structuredClone(project);
    next_project.document = document;
    synchronize_project_notation_metadata(next_project);
    invalidate_calibration_levels(next_project, "L0");
    next_project.updated_at = new Date().toISOString();
    set_projects((current) => current.map((candidate) =>
      candidate.id === project.id ? next_project : candidate));
    const first_measure = document.measures[0];
    const first_event = first_measure?.events[0];
    set_selected_measure_id(first_measure?.id ?? "");
    set_selected_event_id(first_event?.id ?? "");
    set_selected_note_id(first_event?.notes[0]?.id ?? "");
    set_data_json_error(undefined);
    set_message("JSON 已覆盖当前乐谱，简谱与五线谱已按新数据重新渲染。");
  };

  const export_golden_score = () => {
    if (data_json_error) {
      set_message(data_json_error);
      return;
    }
    const result = validate_calibration_project(project);
    const required_levels = calibration_levels.slice(0, 3);
    if (
      required_levels.some((level) => result.by_level[level].errors > 0) ||
      required_levels.some((level) => project.levels[level].status !== "passed")
    ) {
      set_message("需完成 L0-L2 并清除错误后才能导出 Golden Score。");
      return;
    }
    const golden: golden_score_export = {
      schema: "panio-golden-score/v1",
      exported_at: new Date().toISOString(),
      project_id: project.id,
      title: project.title,
      work: project.work,
      source: project.source,
      levels: project.levels,
      validation: result.by_level,
      document: publish_score_document(
        structuredClone(project.document),
        user?.id ?? "calibration-workbench",
      ),
      event_metadata: project.event_metadata,
    };
    download_json(
      `${safe_file_name(project.title)}.golden-score.json`,
      golden,
    );
    set_message("Golden Score 已导出。");
  };

  return (
    <AppShell>
      <div className="calibration-page">
      <section className="calibration-header">
        <div>
          <p className="eyebrow"><ScanSearch size={15} /> 乐谱校准台</p>
          <h1>从原件证据到 Golden Score</h1>
        </div>
        <div className="calibration-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void save_to_database()}
            disabled={is_saving || Boolean(data_json_error)}
          >
            <Save size={16} /> {is_saving ? "保存中" : "保存"}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={Boolean(data_json_error)}
            onClick={export_golden_score}
          >
            <Download size={16} /> 导出 Golden Score
          </button>
        </div>
      </section>

      <section className="calibration-levels" aria-label="校准等级">
        {calibration_levels.map((level) => {
          const state = project.levels[level];
          const result = validation.by_level[level];
          return (
            <button
              key={level}
              type="button"
              className={`calibration-level is-${state.status}`}
              onClick={() => set_level_status(level)}
              aria-pressed={state.status === "passed"}
            >
              <span>{level}</span>
              <strong>{level_copy[level].title}</strong>
              <small>{level_copy[level].copy}</small>
              <em>
                {result.errors > 0
                  ? `${result.errors} 错误`
                  : result.warnings > 0
                    ? `${result.warnings} 提示`
                    : "自动检查通过"}
              </em>
              {state.status === "passed" && <Check size={15} />}
            </button>
          );
        })}
      </section>

      <section
        ref={workbench_ref}
        className={[
          "calibration-shell",
          is_segment_panel_collapsed ? "is-segment-panel-collapsed" : "",
        ].filter(Boolean).join(" ")}
        tabIndex={-1}
        onKeyDown={handle_calibration_keydown}
      >
        <aside
          className={[
            "calibration-projects",
            is_segment_panel_collapsed ? "is-collapsed" : "",
          ].filter(Boolean).join(" ")}
        >
          <header>
            <button
              type="button"
              className="calibration-collapse-button"
              aria-expanded={!is_segment_panel_collapsed}
              aria-label={is_segment_panel_collapsed ? "展开教材片段" : "折叠教材片段"}
              title={is_segment_panel_collapsed ? "展开教材片段" : "折叠教材片段"}
              onClick={() => set_is_segment_panel_collapsed((value) => !value)}
            >
              {is_segment_panel_collapsed
                ? <ChevronRight size={15} />
                : <ChevronDown size={15} />}
            </button>
            {!is_segment_panel_collapsed && (
              <>
                <span>教材片段</span>
                <strong>{segment_options.length || projects.length}</strong>
              </>
            )}
          </header>
          {!is_segment_panel_collapsed && (
            <>
              <div className="calibration-project-list" ref={project_list_ref}>
                {segment_options.length > 0
                  ? segment_options.map(({ material, segment }) => {
                    const project_id = get_material_project_id(material, segment);
                    const segment_key = get_segment_key(material, segment);
                    const display_title =
                      calibrated_title_by_segment_key.get(segment_key) ?? segment.title;
                    return (
                      <button
                        key={project_id}
                        type="button"
                        className={project_id === project.id ? "is-selected" : ""}
                        onClick={() => set_selected_segment_key(segment_key)}
                      >
                        <strong>{display_title}</strong>
                        <span>{material.title} · {segment.source_page_label}</span>
                      </button>
                    );
                  })
                  : projects.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={candidate.id === project.id ? "is-selected" : ""}
                      onClick={() => set_selected_project_id(candidate.id)}
                    >
                      <strong>{candidate.title}</strong>
                      <span>{candidate.work.edition || "未填写版本"}</span>
                    </button>
                  ))}
              </div>
              <button
                type="button"
                className="calibration-delete"
                onClick={delete_project}
              >
                <Trash2 size={14} /> 清除当前校准
              </button>
              <button
                type="button"
                className="calibration-delete"
                disabled={!project.material_catalog?.material_id ||
                  !get_project_segment_id(project) ||
                  deleting_material_segment_id === get_project_segment_id(project)}
                onClick={() => void delete_material_segment()}
              >
                <Trash2 size={14} />
                {deleting_material_segment_id === get_project_segment_id(project)
                  ? "删除中"
                  : "删除教材片段"}
              </button>
            </>
          )}
          {is_segment_panel_collapsed && (
            <button
              type="button"
              className="calibration-collapsed-rail"
              onClick={() => set_is_segment_panel_collapsed(false)}
              aria-label="展开教材片段"
              title="展开教材片段"
            >
              教材
            </button>
          )}
        </aside>

        <div className="calibration-main">
          <section className="calibration-import-bar">
            <FileMusic size={16} />
            <label>
              <span>已有乐谱</span>
              <select
                value={selected_segment_key || project.id}
                onChange={(event) => {
                  if (segment_options.length > 0) {
                    set_selected_segment_key(event.target.value);
                  } else {
                    set_selected_project_id(event.target.value);
                  }
                }}
              >
                {segment_options.length > 0
                  ? segment_options.map(({ material, segment }) => {
                    const segment_key = get_segment_key(material, segment);
                    const display_title =
                      calibrated_title_by_segment_key.get(segment_key) ?? segment.title;
                    return (
                      <option
                        key={get_material_project_id(material, segment)}
                        value={segment_key}
                      >
                        {material.title} · {display_title}
                      </option>
                    );
                  })
                  : projects.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title} · {candidate.work.edition || "当前版本"}
                    </option>
                  ))}
              </select>
            </label>
            <span>
              {is_loading_catalog
                ? "正在同步教材谱库"
                : `${segment_options.length || projects.length} 个教材片段`}
            </span>
          </section>

          <section
            className={[
              "calibration-workbench",
              is_source_panel_collapsed ? "is-source-panel-collapsed" : "",
              `is-inspector-${inspector_layout}`,
            ].filter(Boolean).join(" ")}
          >
            <SourcePane
              project={project}
              is_collapsed={is_source_panel_collapsed}
              on_toggle_collapsed={() =>
                set_is_source_panel_collapsed((value) => !value)}
            />

            <section className="calibration-score-pane">
              <header className="calibration-pane-head">
                <div>
                  <span>数字乐谱</span>
                  <strong>{project.document.title}</strong>
                </div>
                <div className="calibration-preview-tabs" role="tablist" aria-label="乐谱预览">
                  {([
                    ["staff", "五线谱"],
                    ["jianpu", "简谱"],
                    ["data", "数据"],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={preview_mode === mode}
                      className={preview_mode === mode ? "is-selected" : ""}
                      onClick={() => set_preview_mode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </header>
              <div className="calibration-score-toolbar">
                <label>
                  <span>小节</span>
                  <select
                    value={selected_measure?.id ?? ""}
                    onChange={(event) => select_measure(event.target.value)}
                  >
                    {project.document.measures.map((measure) => (
                      <option key={measure.id} value={measure.id}>
                        {measure.number}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" title="新增小节" onClick={add_measure}>
                  <Plus size={15} /> 小节
                </button>
                <button
                  type="button"
                  title="删除当前小节"
                  disabled={!selected_measure}
                  onClick={remove_measure}
                >
                  <Trash2 size={15} />
                </button>
                <button type="button" title="试听当前小节" onClick={() => void play_measure()}>
                  <Play size={15} /> 试听
                </button>
                <button type="button" title="停止试听" onClick={stop_playback}>
                  <Pause size={15} /> 停止
                </button>
                <label>
                  <span>缩放</span>
                  <select
                    value={score_scale_mode}
                    onChange={(event) =>
                      set_score_scale_mode(event.target.value as calibration_score_scale_mode)}
                  >
                    <option value="fit">适屏</option>
                    <option value="width">宽度</option>
                    <option value="actual">原始</option>
                  </select>
                </label>
                <label>
                  <span>分屏</span>
                  <select
                    value={inspector_layout}
                    onChange={(event) =>
                      set_inspector_layout(event.target.value as calibration_inspector_layout)}
                  >
                    <option value="bottom">底部</option>
                    <option value="side">右侧</option>
                    <option value="hidden">隐藏</option>
                  </select>
                </label>
                <span className="calibration-scale-readout">
                  {Math.round(score_scale * 100)}%
                </span>
                <span className="calibration-scale-readout">
                  双向映射 {notation_mappings.length}
                </span>
              </div>
              <div
                ref={score_stage_ref}
                className="calibration-score-stage"
                data-scale-mode={score_scale_mode}
                style={score_stage_style}
              >
                <div className="calibration-score-scale-plane">
                  <div ref={score_content_ref} className="calibration-score-content">
                    <CalibrationPreview
                      document={project.document}
                      event_metadata={project.event_metadata}
                      mode={preview_mode}
                      selected_measure_id={selected_measure?.id}
                      selected_event_id={selected_event?.id}
                      on_event_select={select_event_from_preview}
                      on_document_replace={replace_document_from_json}
                      on_data_json_error_change={set_data_json_error}
                      width={score_preview_width}
                    />
                  </div>
                </div>
              </div>
            </section>

            {inspector_layout !== "hidden" && (
              <InspectorPane
                project={project}
                validation_issues={validation.issues}
                selected_measure_id={selected_measure?.id ?? ""}
                selected_event={selected_event}
                selected_note={selected_note}
                metadata={selected_metadata}
                on_select_issue={(issue) => {
                  if (issue.measure_id) {
                    set_selected_measure_id(issue.measure_id);
                  }
                  if (issue.event_id) {
                    set_selected_event_id(issue.event_id);
                  }
                  if (issue.note_id) {
                    set_selected_note_id(issue.note_id);
                  }
                }}
                on_select_event={select_event}
                on_select_note={set_selected_note_id}
                on_update_measure={update_selected_measure}
                on_update_time_signature={(value) =>
                  update_score_signature(undefined, value)}
                on_update={update_selected_event}
                on_update_slur={update_selected_slur}
                on_update_pitch_names={update_selected_pitch_names}
                on_add_event={add_event}
                on_remove_event={remove_event}
                on_add_note={add_note}
                on_remove_note={remove_note}
              />
            )}
          </section>

          <section className="calibration-metadata">
            <MetadataField
              label="作品标题"
              value={project.title}
              on_change={update_project_title}
            />
            <MetadataField
              label="作曲者"
              value={project.work.composer}
              on_change={(value) => update_project((next) => {
                next.work.composer = value;
              })}
            />
            <MetadataField
              label="作品号"
              value={project.work.opus}
              on_change={(value) => update_project((next) => {
                next.work.opus = value;
              })}
            />
            <MetadataField
              label="版本 / 编订"
              value={project.work.edition}
              on_change={(value) => update_project((next) => {
                next.work.edition = value;
              })}
            />
            <MetadataField
              label="出版社"
              value={project.work.publisher}
              on_change={(value) => update_project((next) => {
                next.work.publisher = value;
              })}
            />
            <MetadataField
              label="来源"
              value={project.work.source}
              on_change={(value) => update_project((next) => {
                next.work.source = value;
              })}
            />
            <MetadataField
              label="调号"
              value={project.document.key_signature}
              on_change={(value) => update_score_signature(value)}
            />
            <MetadataField
              label="拍号"
              value={project.document.time_signature}
              on_change={(value) => update_score_signature(undefined, value)}
            />
            <NumberField
              label="主音 MIDI"
              value={project.document.tonic_midi}
              min={0}
              step={1}
              on_change={(value) => update_project((next) => {
                next.document.tonic_midi = value;
                invalidate_calibration_levels(next, "L1");
              })}
            />
            <NumberField
              label="原件页数"
              value={project.source.page_count ?? 0}
              min={0}
              step={1}
              on_change={(value) => update_project((next) => {
                next.source.page_count = value > 0 ? value : null;
                invalidate_calibration_levels(next, "L0");
              })}
            />
          </section>
          {message && <p className="calibration-message" role="status">{message}</p>}
          {data_json_error && (
            <p className="calibration-message is-error" role="alert">
              {data_json_error}
            </p>
          )}
        </div>
      </section>
      </div>
    </AppShell>
  );
}

function SourcePane({
  project,
  is_collapsed,
  on_toggle_collapsed,
}: {
  project: calibration_project;
  is_collapsed: boolean;
  on_toggle_collapsed: () => void;
}) {
  const beyer_title_annotation = get_project_beyer_title_annotation(project);
  return (
    <section
      className={[
        "calibration-source-pane",
        is_collapsed ? "is-collapsed" : "",
      ].filter(Boolean).join(" ")}
    >
      <header className="calibration-pane-head">
        {!is_collapsed && (
          <div>
            <span>已有内容</span>
            <strong>{project.source.file_name ?? project.title}</strong>
          </div>
        )}
        <button
          type="button"
          className="calibration-collapse-button"
          aria-expanded={!is_collapsed}
          aria-label={is_collapsed ? "展开已有内容" : "折叠已有内容"}
          title={is_collapsed ? "展开已有内容" : "折叠已有内容"}
          onClick={on_toggle_collapsed}
        >
          {is_collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
      </header>
      {is_collapsed && (
        <button
          type="button"
          className="calibration-collapsed-rail"
          onClick={on_toggle_collapsed}
          aria-label="展开已有内容"
          title="展开已有内容"
        >
          已有
        </button>
      )}
      {!is_collapsed && (
        <div className="calibration-source-stage">
          <div className="calibration-empty-source">
            <FolderOpen size={28} />
            <strong>校准对象来自教材谱库</strong>
            <span>{project.document.provenance.source_file ?? project.document.id}</span>
            <span>{project.work.source || "不会在此处上传新资料"}</span>
            {beyer_title_annotation && (
              <BeyerTitleAnnotation annotation={beyer_title_annotation} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function BeyerTitleAnnotation({
  annotation,
}: {
  annotation: beyer_title_annotation_summary;
}) {
  const selected_label = annotation.selected_pages.length > 0
    ? annotation.selected_pages
        .map((entry) => `原谱第 ${entry.page} 页：${entry.label}`)
        .join("；")
    : "当前片段不在第 12-109 条标题覆盖范围内";
  return (
    <div className="calibration-title-annotation">
      <strong>
        《拜厄》标题特殊处理：共 {annotation.total_count} 条
      </strong>
      <span>
        覆盖第 {annotation.first_title_number}-{annotation.last_title_number} 条标题
      </span>
      <span>{selected_label}</span>
      <details>
        <summary>查看第 22 页起全部页码对应关系</summary>
        <div>
          {annotation.pages.map((entry) => (
            <span key={entry.page}>
              原谱第 {entry.page} 页：{entry.label}
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}

function InspectorPane({
  project,
  validation_issues,
  selected_measure_id,
  selected_event,
  selected_note,
  metadata,
  on_select_issue,
  on_select_event,
  on_select_note,
  on_update_measure,
  on_update_time_signature,
  on_update,
  on_update_slur,
  on_update_pitch_names,
  on_add_event,
  on_remove_event,
  on_add_note,
  on_remove_note,
}: {
  project: calibration_project;
  validation_issues: calibration_issue[];
  selected_measure_id: string;
  selected_event?: score_document_event;
  selected_note?: score_document_note;
  metadata?: calibration_event_metadata;
  on_select_issue: (issue: calibration_issue) => void;
  on_select_event: (event_id: string) => void;
  on_select_note: (note_id: string) => void;
  on_update_measure: (
    update: (measure: calibration_project["document"]["measures"][number]) => void,
  ) => void;
  on_update_time_signature: (value: string) => void;
  on_update: (
    update: (
      event: score_document_event,
      metadata: calibration_event_metadata,
    ) => void,
  ) => void;
  on_update_slur: (value: calibration_event_metadata["slur"]) => void;
  on_update_pitch_names: (value: string) => void;
  on_add_event: () => void;
  on_remove_event: () => void;
  on_add_note: () => void;
  on_remove_note: () => void;
}) {
  const selected_measure = project.document.measures.find((measure) =>
    measure.id === selected_measure_id);
  const events = selected_measure?.events ?? [];
  const event_selector = (
    <label>
      <span>事件</span>
      <select
        value={selected_event?.id ?? ""}
        onChange={(event) => on_select_event(event.target.value)}
      >
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.id} · {event.onset_beats} 拍
          </option>
        ))}
      </select>
    </label>
  );
  const note_selector = selected_event ? (
    <div className="calibration-inline-editor">
      <label>
        <span>音符</span>
        <select
          value={selected_note?.id ?? ""}
          onChange={(event) => on_select_note(event.target.value)}
        >
          {selected_event.notes.map((note) => (
            <option key={note.id} value={note.id}>{note.id}</option>
          ))}
        </select>
      </label>
      <button type="button" title="新增音符" onClick={on_add_note}>
        <Plus size={13} />
      </button>
      <button
        type="button"
        title="删除当前音符"
        disabled={!selected_note}
        onClick={on_remove_note}
      >
        <Trash2 size={13} />
      </button>
    </div>
  ) : null;
  return (
    <aside className="calibration-inspector">
      <section className="calibration-issues">
        <header>
          <span>自动校验</span>
          <strong>{validation_issues.length}</strong>
        </header>
        <div>
          {validation_issues.length === 0 ? (
            <p className="calibration-clear">
              <Check size={15} /> 当前自动检查通过
            </p>
          ) : validation_issues.slice(0, 12).map((issue) => (
            <button
              key={issue.id}
              type="button"
              className={`is-${issue.severity}`}
              onClick={() => on_select_issue(issue)}
            >
              <span>{issue.level} · {issue.severity === "error" ? "错误" : "提示"}</span>
              <strong>{issue.message}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="calibration-event-editor">
        <header>
          <span>当前事件</span>
          <div className="calibration-editor-actions">
            <button type="button" title="新增事件" onClick={on_add_event}>
              <Plus size={13} />
            </button>
            <button
              type="button"
              title="删除当前事件"
              disabled={!selected_event}
              onClick={on_remove_event}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </header>
        {selected_event && selected_measure ? (
          <CalibrationFieldsPanel
            project={project}
            measure={selected_measure}
            event={selected_event}
            selected_note={selected_note}
            metadata={metadata}
            navigation={(
              <>
                {event_selector}
                {note_selector}
              </>
            )}
            on_update_measure={on_update_measure}
            on_update_time_signature={on_update_time_signature}
            on_update={on_update}
            on_update_slur={on_update_slur}
            on_update_pitch_names={on_update_pitch_names}
          />
        ) : (
          event_selector
        )}
      </section>
    </aside>
  );
}

const calibration_field_labels: Record<calibration_field, string> = {
  pitch_name: "音名 / 八度",
  duration: "时值",
  fingering: "指法",
  hand: "手别",
  measure_number: "小节号",
  measure_beats: "拍数",
  measure_beat_unit: "拍号分母",
  beat_position: "节拍位置",
  voice: "声部",
  staff: "谱表",
  clef: "谱号",
  accidental: "临时记号",
  source_page: "来源页",
  source_system: "来源系统",
  chord: "和弦",
  rest: "休止符",
  tie: "Tie",
  slur: "Slur",
  articulation: "奏法",
  dynamics: "力度",
  tempo: "速度记号",
  repeat: "反复记号",
  pitch_midi: "MIDI 音高",
};

function CalibrationFieldsPanel({
  project,
  measure,
  event,
  selected_note,
  metadata,
  navigation,
  on_update_measure,
  on_update_time_signature,
  on_update,
  on_update_slur,
  on_update_pitch_names,
}: {
  project: calibration_project;
  measure: calibration_project["document"]["measures"][number];
  event: score_document_event;
  selected_note?: score_document_note;
  metadata?: calibration_event_metadata;
  navigation: ReactNode;
  on_update_measure: (
    update: (measure: calibration_project["document"]["measures"][number]) => void,
  ) => void;
  on_update_time_signature: (value: string) => void;
  on_update: (
    update: (
      event: score_document_event,
      metadata: calibration_event_metadata,
    ) => void,
  ) => void;
  on_update_slur: (value: calibration_event_metadata["slur"]) => void;
  on_update_pitch_names: (value: string) => void;
}) {
  const field_order = use_app_settings_store((state) => state.calibration_field_order);
  const primary_fields = use_app_settings_store((state) => state.calibration_primary_fields);
  const set_calibration_field_layout = use_app_settings_store((state) =>
    state.set_calibration_field_layout);
  const [is_reordering, set_is_reordering] = useState(false);

  const render_field = (field: calibration_field) => {
    if (field === "pitch_name") {
      return (
        <PitchNameField
          label="音名 / 八度"
          value={metadata?.pitch_name ?? ""}
          on_commit={on_update_pitch_names}
        />
      );
    }
    if (field === "duration") {
      return (
        <NumberField
          label="时值"
          value={event.duration_beats}
          min={0.0625}
          step={0.125}
          on_change={(value) => on_update((score_event, event_metadata) => {
            score_event.duration_beats = value;
            event_metadata.duration_label = beats_to_duration_label(value);
          })}
        />
      );
    }
    if (field === "measure_number") {
      return (
        <MetadataField
          label="小节号"
          value={measure.number}
          on_change={(value) => on_update_measure((score_measure) => {
            score_measure.number = value;
          })}
        />
      );
    }
    if (field === "measure_beats") {
      return (
        <NumberField
          label="拍数"
          value={measure.meter.beats}
          min={1}
          step={1}
          on_change={(value) => on_update_time_signature(
            `${value}/${measure.meter.beat_unit}`,
          )}
        />
      );
    }
    if (field === "measure_beat_unit") {
      return (
        <NumberField
          label="拍号分母"
          value={measure.meter.beat_unit}
          min={1}
          step={1}
          on_change={(value) => on_update_time_signature(
            `${measure.meter.beats}/${value}`,
          )}
        />
      );
    }
    if (field === "beat_position") {
      return (
        <NumberField
          label="节拍位置"
          value={event.onset_beats}
          min={0}
          step={0.25}
          on_change={(value) => on_update((score_event, event_metadata) => {
            score_event.onset_beats = value;
            event_metadata.beat_position = `${value + 1}`;
          })}
        />
      );
    }
    if (field === "voice") {
      return (
        <NumberField
          label="声部"
          value={event.voice}
          min={1}
          step={1}
          on_change={(value) => on_update((score_event) => {
            score_event.voice = value;
          })}
        />
      );
    }
    if (field === "staff") {
      return (
        <NumberField
          label="谱表"
          value={metadata?.staff ?? 1}
          min={1}
          step={1}
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.staff = value;
          })}
        />
      );
    }
    if (field === "clef") {
      return (
        <SelectField
          label="谱号"
          value={metadata?.clef ?? "unknown"}
          options={[
            ["treble", "高音谱号"],
            ["bass", "低音谱号"],
            ["alto", "中音谱号"],
            ["tenor", "次中音谱号"],
            ["percussion", "打击乐谱号"],
            ["unknown", "待确认"],
          ]}
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.clef =
              value as calibration_event_metadata["clef"];
          })}
        />
      );
    }
    if (field === "accidental") {
      return (
        <ReadOnlyField
          label="临时记号"
          value={metadata?.accidental ?? ""}
        />
      );
    }
    if (field === "source_page") {
      return (
        <NumberField
          label="来源页"
          value={metadata?.source_page ?? 0}
          min={0}
          step={1}
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.source_page = value > 0 ? value : null;
          })}
        />
      );
    }
    if (field === "source_system") {
      return (
        <NumberField
          label="来源系统"
          value={metadata?.source_system ?? 0}
          min={0}
          step={1}
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.source_system = value > 0 ? value : null;
          })}
        />
      );
    }
    if (field === "chord") {
      return (
        <MetadataField
          label="和弦"
          value={event.chord ?? ""}
          on_change={(value) => on_update((score_event) => {
            if (value.trim()) {
              score_event.chord = value.trim();
            } else {
              delete score_event.chord;
            }
          })}
        />
      );
    }
    if (field === "rest") {
      return (
        <SelectField
          label="休止符"
          value={event.notes.length === 0 ? "rest" : "note"}
          options={[
            ["note", "否"],
            ["rest", "是"],
          ]}
          on_change={(value) => on_update((score_event, event_metadata) => {
            if (value === "rest") {
              score_event.notes = [];
              event_metadata.rest = "rest";
            } else {
              event_metadata.rest = "";
              if (score_event.notes.length === 0) {
                score_event.notes = [{
                  id: unique_id(`${score_event.id}-note`),
                  midi: project.document.tonic_midi,
                  source_refs: [],
                }];
              }
            }
          })}
        />
      );
    }
    if (field === "tie") {
      return (
        <SelectField
          label="Tie"
          value={event.tie ?? "none"}
          options={[
            ["none", "无"],
            ["start", "开始"],
            ["continue", "延续"],
            ["stop", "结束"],
          ]}
          on_change={(value) => on_update((score_event) => {
            if (value === "none") {
              delete score_event.tie;
            } else {
              score_event.tie = value as "start" | "continue" | "stop";
            }
          })}
        />
      );
    }
    if (field === "slur") {
      return (
        <SelectField
          label="Slur"
          value={metadata?.slur ?? "none"}
          options={[
            ["none", "无"],
            ["start", "开始"],
            ["continue", "延续"],
            ["stop", "结束"],
          ]}
          on_change={(value) =>
            on_update_slur(value as calibration_event_metadata["slur"])}
        />
      );
    }
    if (field === "articulation") {
      return (
        <MetadataField
          label="奏法"
          value={metadata?.articulation ?? ""}
          placeholder="staccato / accent / tenuto"
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.articulation = value;
          })}
        />
      );
    }
    if (field === "dynamics") {
      return (
        <MetadataField
          label="力度"
          value={metadata?.dynamics ?? ""}
          placeholder="pp / p / mp / mf / f / ff"
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.dynamics = value;
          })}
        />
      );
    }
    if (field === "tempo") {
      return (
        <MetadataField
          label="速度记号"
          value={metadata?.tempo ?? ""}
          placeholder="Allegro / quarter=120"
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.tempo = value;
          })}
        />
      );
    }
    if (field === "repeat") {
      return (
        <MetadataField
          label="反复记号"
          value={metadata?.repeat ?? ""}
          placeholder="repeat-start / repeat-end / D.C."
          on_change={(value) => on_update((_, event_metadata) => {
            event_metadata.repeat = value;
          })}
        />
      );
    }
    if (field === "pitch_midi") {
      return selected_note ? (
        <NumberField
          label="MIDI 音高"
          value={selected_note.midi}
          min={21}
          step={1}
          on_change={(value) => on_update((score_event, event_metadata) => {
            const note = score_event.notes.find((candidate) =>
              candidate.id === selected_note.id);
            if (note) {
              note.midi = value;
              event_metadata.pitch_name =
                score_event.notes
                  .map((candidate) => midi_to_pitch_name(candidate.midi))
                  .join(" / ");
            }
          })}
        />
      ) : (
        <ReadOnlyField label="MIDI 音高" value="请先选择音符" />
      );
    }
    if (field === "fingering") {
      return selected_note ? (
        <NumberField
          label="指法"
          value={selected_note.finger ?? 0}
          min={0}
          step={1}
          on_change={(value) => on_update((score_event) => {
            const note = score_event.notes.find((candidate) =>
              candidate.id === selected_note.id);
            if (!note) return;
            if (value < 1 || value > 5) {
              delete note.finger;
              delete note.fingering;
            } else {
              note.finger = value as 1 | 2 | 3 | 4 | 5;
              note.fingering = create_manual_fingering_annotation(
                "校准台当前事件面板设置指法。",
                note.source_refs,
              );
            }
          })}
        />
      ) : (
        <ReadOnlyField label="指法" value="请先选择音符" />
      );
    }
    if (field === "hand") {
      return (
        <SelectField
          label="手别"
          value={event.hand}
          options={[["right", "右手"], ["left", "左手"]]}
          on_change={(value) => on_update((score_event, event_metadata) => {
            score_event.hand = value as "left" | "right";
            event_metadata.hand = score_event.hand;
          })}
        />
      );
    }
    return null;
  };

  const ordered_primary_fields = field_order.filter((field) =>
    primary_fields.includes(field));
  const ordered_secondary_fields = field_order.filter((field) =>
    !primary_fields.includes(field));
  const reset_layout = () => {
    set_calibration_field_layout({
      calibration_field_order: [...all_calibration_fields],
      calibration_primary_fields: [...default_primary_calibration_fields],
    });
  };
  const move_field_in_section = (
    visible_fields: readonly calibration_field[],
    field: calibration_field,
    direction: -1 | 1,
  ) => {
    const index = visible_fields.indexOf(field);
    const target_field = visible_fields[index + direction];
    if (!target_field) {
      return;
    }
    set_calibration_field_layout({
      calibration_field_order: swap_fields(field_order, field, target_field),
      calibration_primary_fields: primary_fields,
    });
  };
  const render_sortable_field = (
    field: calibration_field,
    visible_fields: readonly calibration_field[],
    mode: "primary" | "secondary",
  ) => {
    const index = visible_fields.indexOf(field);
    const label = calibration_field_labels[field];
    return (
      <div
        key={field}
        className="calibration-sortable-field"
        data-calibration-field={field}
      >
        {render_field(field)}
        {is_reordering && (
          <div className="calibration-field-order-actions">
            {mode === "primary" ? (
              <>
                <button
                  type="button"
                  title={`上移${label}`}
                  disabled={index === 0}
                  onClick={() => move_field_in_section(visible_fields, field, -1)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  title={`下移${label}`}
                  disabled={index === visible_fields.length - 1}
                  onClick={() => move_field_in_section(visible_fields, field, 1)}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  title={`移出主要校准项：${label}`}
                  onClick={() => set_calibration_field_layout({
                    calibration_field_order: field_order,
                    calibration_primary_fields: primary_fields.filter((candidate) =>
                      candidate !== field),
                  })}
                >
                  <Trash2 size={12} />
                </button>
              </>
            ) : (
              <button
                type="button"
                title={`加入主要校准项：${label}`}
                onClick={() => set_calibration_field_layout({
                  calibration_field_order: field_order,
                  calibration_primary_fields: primary_fields.includes(field)
                    ? primary_fields
                    : [...primary_fields, field],
                })}
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <section className="calibration-primary-fields">
        <header>
          <strong>主要校准项</strong>
          <div>
            {is_reordering && (
              <button
                type="button"
                title="恢复默认布局"
                onClick={reset_layout}
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button
              type="button"
              className={is_reordering ? "is-active" : ""}
              title={is_reordering ? "完成字段布局" : "调整字段布局"}
              aria-pressed={is_reordering}
              onClick={() => set_is_reordering((current) => !current)}
            >
              <SlidersHorizontal size={13} />
            </button>
          </div>
        </header>
        <div className="calibration-primary-field-grid">
          {ordered_primary_fields.length === 0 ? (
            <p className="calibration-empty-fields">暂无主要校准项</p>
          ) : ordered_primary_fields.map((field) =>
            render_sortable_field(field, ordered_primary_fields, "primary"))}
        </div>
      </section>

      <div className="calibration-event-navigation">
        {navigation}
      </div>

      <section className="calibration-secondary-fields">
        <header>
          <strong>其他校准项</strong>
          <span>{ordered_secondary_fields.length}</span>
        </header>
        <div className="calibration-primary-field-grid">
          {ordered_secondary_fields.map((field) =>
            render_sortable_field(field, ordered_secondary_fields, "secondary"))}
        </div>
      </section>
    </>
  );
}

function swap_fields(
  order: readonly calibration_field[],
  first: calibration_field,
  second: calibration_field,
): calibration_field[] {
  const normalized = move_calibration_field(order, first, 1);
  const first_index = order.indexOf(first);
  const second_index = order.indexOf(second);
  if (first_index < 0 || second_index < 0) {
    return normalized;
  }
  const next = [...order];
  [next[first_index], next[second_index]] = [next[second_index], next[first_index]];
  return next;
}

function MetadataField({
  label,
  value,
  placeholder,
  on_change,
}: {
  label: string;
  value: string;
  placeholder?: string;
  on_change: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => on_change(event.target.value)}
      />
    </label>
  );
}
function PitchNameField({
  label,
  value,
  on_commit,
}: {
  label: string;
  value: string;
  on_commit: (value: string) => void;
}) {
  const [draft, set_draft] = useState(value);
  useEffect(() => set_draft(value), [value]);
  return (
    <label>
      <span>{label}</span>
      <input
        value={draft}
        placeholder="C4 / F#5"
        onChange={(event) => set_draft(event.target.value)}
        onBlur={() => on_commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input value={value || "无"} readOnly aria-readonly="true" />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  step,
  on_change,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  on_change: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => on_change(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  on_change,
}: {
  label: string;
  value: string;
  options: Array<readonly [string, string]>;
  on_change: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => on_change(event.target.value)}>
        {options.map(([option_value, option_label]) => (
          <option key={option_value} value={option_value}>{option_label}</option>
        ))}
      </select>
    </label>
  );
}

function CalibrationState({
  icon,
  title,
  copy,
  children,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <section className="calibration-state">
      {icon}
      <h1>{title}</h1>
      <p>{copy}</p>
      {children}
    </section>
  );
}

function create_event_metadata(
  event: score_document_event,
): calibration_event_metadata {
  return {
    event_id: event.id,
    staff: event.hand === "left" ? 2 : 1,
    hand: event.hand,
    clef: "treble",
    pitch_name: event.notes.map((note) => midi_to_pitch_name(note.midi)).join(" / "),
    duration_label: beats_to_duration_label(event.duration_beats),
    beat_position: `${event.onset_beats + 1}`,
    measure_label: "",
    accidental: "",
    rest: event.notes.length === 0
      ? `${beats_to_duration_label(event.duration_beats)} rest`
      : "",
    tempo: "",
    repeat: "",
    articulation: "",
    dynamics: "",
    slur: "none",
    source_page: null,
    source_system: null,
  };
}

function get_segment_key(
  material: jianpu_material,
  segment: jianpu_segment,
): string {
  return `${material.id}:${segment.id}`;
}

function get_material_project_id(
  material: jianpu_material,
  segment: jianpu_segment,
): string {
  return `material:${get_segment_key(material, segment)}`;
}

function get_project_segment_id(project: calibration_project): string | undefined {
  const match = /^material:[^:]+:(.+)$/.exec(project.id);
  return match?.[1];
}

function create_calibration_favorite(
  project: calibration_project,
): Omit<score_favorite_entry, "updated_at"> {
  const material_id = project.material_catalog?.material_id;
  const segment_id = get_project_segment_id(project);
  return {
    id: `calibration:${project.id}`,
    kind: "calibration",
    title: project.title,
    subtitle: `${project.work.edition || "校准曲谱"} · ${project.document.measures.length} 小节`,
    href: material_id && segment_id
      ? `/教材/${material_id}/${segment_id}`
      : "/校准",
    source: "乐谱校准",
  };
}

function project_from_jianpu_segment(
  material: jianpu_material,
  segment: jianpu_segment,
  score: jianpu_score,
): calibration_project {
  const document = score_document_from_jianpu_segment(material, segment, score);
  const now = new Date().toISOString();
  const project: calibration_project = {
    schema_version: 1,
    id: get_material_project_id(material, segment),
    title: document.title,
    work: {
      composer: "",
      opus: "",
      edition: material.title,
      publisher: "",
      source: segment.source_page_label,
    },
    source: {
      file_name: segment.musicxml_url,
      mime_type: "application/x-panio-score",
      page_count: material.page_count,
      attached_at: now,
    },
    material_catalog: {
      material_id: material.id,
      title: material.title,
      chapters: material.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        description: chapter.description,
        page_start: chapter.page_start,
        page_end: chapter.page_end,
      })),
    },
    musicxml: null,
    document,
    event_metadata: {},
    levels: Object.fromEntries(calibration_levels.map((level) => [
      level,
      { status: "pending", confirmed_at: null },
    ])) as calibration_project["levels"],
    updated_at: now,
  };
  project.event_metadata = create_jianpu_event_metadata(document, segment);
  project.levels.L0.status = "in_progress";
  project.levels.L1.status = "in_progress";
  project.levels.L2.status = "in_progress";
  project.levels.L3.status = "in_progress";
  return project;
}

function score_document_from_jianpu_segment(
  material: jianpu_material,
  segment: jianpu_segment,
  score: jianpu_score,
): score_document {
  const meter = parse_time_signature(score.time_signature);
  return {
    schema_version: 2,
    id: `score-${material.id}-${segment.id}`,
    number: String(segment.sequence),
    title: `${material.title} · ${segment.title}`,
    key_signature: score.key_signature,
    tonic_midi: score.tonic_midi,
    time_signature: score.time_signature,
    status: "published",
    provenance: {
      kind: "manual",
      source_id: segment.id,
      source_file: segment.musicxml_url,
      source_sha256: null,
      font_config_version: null,
      importer_version: "jianpu-material-calibration/v1",
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures: score.measures.map((measure) => ({
      id: `${score.segment_id}-measure-${measure.index}`,
      number: measure.number,
      meter,
      events: measure.events.flatMap((event, event_index) => {
        const right = event.right_notes.length > 0
          ? [create_score_event(score, measure.index, event_index, "right", event.right_notes, event)]
          : [];
        const left = event.left_notes.length > 0
          ? [create_score_event(score, measure.index, event_index, "left", event.left_notes, event)]
          : [];
        if (right.length === 0 && left.length === 0) {
          return [create_score_event(score, measure.index, event_index, "right", [], event)];
        }
        return [...right, ...left];
      }),
    })),
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: "calibration-workbench",
      published_at: new Date().toISOString(),
      note: "Material library calibration source",
    },
  };
}

function create_score_event(
  score: jianpu_score,
  measure_index: number,
  event_index: number,
  hand: "right" | "left",
  midis: number[],
  event: jianpu_score["measures"][number]["events"][number],
): score_document_event {
  return {
    id: `${score.segment_id}-m${measure_index}-e${event_index}-${hand}`,
    onset_beats: event.onset_beats,
    duration_beats: event.duration_beats,
    hand,
    voice: hand === "right" ? 1 : 2,
    chord: event.chord,
    notes: midis.map((midi, note_index) => ({
      id: `${score.segment_id}-m${measure_index}-e${event_index}-${hand}-n${note_index}`,
      midi,
      source_refs: [],
    })),
    source_refs: [],
  };
}

function create_jianpu_event_metadata(
  document: score_document,
  segment: jianpu_segment,
): Record<string, calibration_event_metadata> {
  const metadata: Record<string, calibration_event_metadata> = {};
  for (const measure of document.measures) {
    const measure_index = Number(measure.number);
    const page_slice = segment.page_slices.find((slice) =>
      measure_index >= slice.measure_start && measure_index <= slice.measure_end);
    for (const event of measure.events) {
      metadata[event.id] = {
        ...create_event_metadata(event),
        source_page: page_slice?.source_pages[0] ?? segment.source_pages[0] ?? null,
        source_system: 1,
      };
    }
  }
  return metadata;
}

function get_project_beyer_title_annotation(
  project: calibration_project,
): beyer_title_annotation_summary | undefined {
  if (!project.id.startsWith("material:beyer:")) {
    return undefined;
  }
  const source_pages = [...new Set(
    Object.values(project.event_metadata)
      .map((metadata) => metadata.source_page)
      .filter((page): page is number => typeof page === "number" && page > 0),
  )].sort((a, b) => a - b);
  return get_beyer_title_annotation_for_pages(source_pages);
}

function merge_material_projects(
  current: calibration_project[],
  source_projects: calibration_project[],
): calibration_project[] {
  const current_by_id = new Map(current.map((project) => [project.id, project]));
  const next = source_projects.map((source_project) => {
    const saved = current_by_id.get(source_project.id);
    return saved ?? source_project;
  });
  const source_ids = new Set(source_projects.map((project) => project.id));
  return [
    ...next,
    ...current.filter((project) =>
      project.id.startsWith("material:") && !source_ids.has(project.id)),
  ];
}

function parse_time_signature(value: string): { beats: number; beat_unit: number } {
  const [beats, beat_unit] = value.split("/").map(Number);
  if (
    Number.isInteger(beats) &&
    Number.isInteger(beat_unit) &&
    beats > 0 &&
    beat_unit > 0
  ) {
    return { beats, beat_unit };
  }
  return { beats: 4, beat_unit: 4 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function next_tie_value(
  value: score_document_event["tie"],
): score_document_event["tie"] {
  if (value === "start") return "continue";
  if (value === "continue") return "stop";
  if (value === "stop") return undefined;
  return "start";
}

function is_text_input_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

function download_json(file_name: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file_name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safe_file_name(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/gu, "-").trim() || "golden-score";
}

function unique_id(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${suffix}`;
}

function invalidate_calibration_levels(
  project: calibration_project,
  from: calibration_level,
): void {
  const start = calibration_levels.indexOf(from);
  calibration_levels.slice(start).forEach((level) => {
    project.levels[level] = {
      status: "in_progress",
      confirmed_at: null,
    };
  });
}
