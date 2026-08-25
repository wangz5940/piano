import { create } from "zustand";

import { api_error, api_request } from "@/features/api/client";
import type {
  account_user,
  auth_response,
  user_snapshot,
} from "@/features/auth/types";
import type { practice_result, user_progress } from "@/features/course/types";
import type { app_settings } from "@/features/settings/storage";
import { create_initial_settings } from "@/features/settings/storage";
import {
  set_settings_sync_handler,
  use_app_settings_store,
} from "@/store/useAppSettingsStore";
import {
  set_progress_sync_handler,
  use_progress_store,
} from "@/store/useProgressStore";

type auth_status = "idle" | "loading" | "guest" | "authenticated" | "error";
type sync_status = "local" | "syncing" | "synced" | "pending";

interface auth_store {
  status: auth_status;
  sync_status: sync_status;
  user?: account_user;
  snapshot_revision: number;
  last_synced_at?: string;
  error?: string;
  initialize: () => Promise<void>;
  register: (input: {
    email: string;
    display_name: string;
    password: string;
    role: "student" | "parent";
  }) => Promise<boolean>;
  login: (input: { email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  delete_account: (password: string) => Promise<boolean>;
  clear_error: () => void;
}

let initialized = false;
let sync_queue = Promise.resolve();

export const use_auth_store = create<auth_store>((set, get) => ({
  status: "idle",
  sync_status: "local",
  snapshot_revision: 0,
  initialize: async () => {
    if (initialized) {
      return;
    }
    initialized = true;
    install_sync_handlers(get, set);
    set({ status: "loading", error: undefined });
    try {
      const response = await api_request<auth_response>("/api/v1/auth/me");
      await merge_and_apply(response, set, false);
    } catch (error) {
      if (error instanceof api_error && error.status === 401) {
        set({ status: "guest", sync_status: "local", user: undefined });
        return;
      }
      set({
        status: "error",
        sync_status: "pending",
        error: get_error_message(error, "暂时无法连接账号服务，本地练习仍可使用。"),
      });
    }
  },
  register: async (input) => {
    set({ status: "loading", error: undefined });
    try {
      const response = await api_request<auth_response>("/api/v1/auth/register", {
        method: "POST",
        body: input,
      });
      await merge_and_apply(response, set, true);
      return true;
    } catch (error) {
      set({
        status: "guest",
        error: get_error_message(error, "注册失败，请稍后重试。"),
      });
      return false;
    }
  },
  login: async (input) => {
    set({ status: "loading", error: undefined });
    try {
      const response = await api_request<auth_response>("/api/v1/auth/login", {
        method: "POST",
        body: input,
      });
      await merge_and_apply(response, set, false);
      return true;
    } catch (error) {
      set({
        status: "guest",
        error: get_error_message(error, "登录失败，请稍后重试。"),
      });
      return false;
    }
  },
  logout: async () => {
    try {
      await api_request("/api/v1/auth/logout", { method: "POST", body: {} });
    } finally {
      set({
        status: "guest",
        sync_status: "local",
        snapshot_revision: 0,
        last_synced_at: undefined,
        user: undefined,
        error: undefined,
      });
    }
  },
  delete_account: async (password) => {
    try {
      await api_request("/api/v1/me", {
        method: "DELETE",
        body: { password },
      });
      set({
        status: "guest",
        sync_status: "local",
        snapshot_revision: 0,
        last_synced_at: undefined,
        user: undefined,
        error: undefined,
      });
      return true;
    } catch (error) {
      set({ error: get_error_message(error, "账号删除失败。") });
      return false;
    }
  },
  clear_error: () => set({ error: undefined }),
}));

async function merge_and_apply(
  response: auth_response,
  set: Parameters<typeof use_auth_store.setState>[0] extends never
    ? never
    : (value: Partial<auth_store>) => void,
  force_merge: boolean,
): Promise<void> {
  const local_progress = use_progress_store.getState().progress;
  const local_settings = get_current_settings();
  if (!force_merge && !has_meaningful_local_data(local_progress, local_settings)) {
    apply_snapshot(response.snapshot);
    set({
      status: "authenticated",
      sync_status: "synced",
      user: response.user,
      snapshot_revision: response.snapshot.revision,
      last_synced_at: response.snapshot.updated_at,
      error: undefined,
    });
    return;
  }
  const merged = await api_request<{ snapshot: user_snapshot }>("/api/v1/me/snapshot", {
    method: "PUT",
    body: {
      base_revision: response.snapshot.revision,
      merge_local: true,
      progress: local_progress,
      preferences: local_settings,
    },
  });
  await archive_progress_results(merged.snapshot.progress);
  apply_snapshot(merged.snapshot);
  set({
    status: "authenticated",
    sync_status: "synced",
    user: response.user,
    snapshot_revision: merged.snapshot.revision,
    last_synced_at: merged.snapshot.updated_at,
    error: undefined,
  });
}

function install_sync_handlers(
  get: () => auth_store,
  set: (value: Partial<auth_store>) => void,
): void {
  set_progress_sync_handler((progress, result) => {
    enqueue_sync(get, set, progress, get_current_settings(), result);
  });
  set_settings_sync_handler((settings) => {
    enqueue_sync(get, set, use_progress_store.getState().progress, settings);
  });
}

function enqueue_sync(
  get: () => auth_store,
  set: (value: Partial<auth_store>) => void,
  progress: user_progress,
  settings: app_settings,
  result?: practice_result,
): void {
  if (!get().user) {
    return;
  }
  set({ sync_status: "syncing" });
  sync_queue = sync_queue
    .then(async () => {
      if (result) {
        await archive_practice_result(result);
      }
      await sync_snapshot(get, set, progress, settings);
    })
    .catch((error: unknown) => {
      set({
        sync_status: "pending",
        error: get_error_message(error, "同步暂时中断，练习记录已保存在本机。"),
      });
    });
}

async function sync_snapshot(
  get: () => auth_store,
  set: (value: Partial<auth_store>) => void,
  progress: user_progress,
  settings: app_settings,
): Promise<void> {
  try {
    const response = await api_request<{ snapshot: user_snapshot }>("/api/v1/me/snapshot", {
      method: "PUT",
      body: {
        base_revision: get().snapshot_revision,
        merge_local: false,
        progress,
        preferences: settings,
      },
    });
    apply_snapshot(response.snapshot);
    set({
      sync_status: "synced",
      snapshot_revision: response.snapshot.revision,
      last_synced_at: response.snapshot.updated_at,
      error: undefined,
    });
  } catch (error) {
    if (!(error instanceof api_error) || error.status !== 409) {
      throw error;
    }
    const payload = as_record(error.payload);
    const remote_snapshot = payload.snapshot as user_snapshot | undefined;
    if (!remote_snapshot) {
      throw error;
    }
    const response = await api_request<{ snapshot: user_snapshot }>("/api/v1/me/snapshot", {
      method: "PUT",
      body: {
        base_revision: remote_snapshot.revision,
        merge_local: true,
        progress,
        preferences: settings,
      },
    });
    apply_snapshot(response.snapshot);
    set({
      sync_status: "synced",
      snapshot_revision: response.snapshot.revision,
      last_synced_at: response.snapshot.updated_at,
      error: undefined,
    });
  }
}

async function archive_practice_result(result: practice_result): Promise<void> {
  await api_request("/api/v1/practice-sessions", {
    method: "POST",
    body: to_practice_payload(result),
  });
}

async function archive_progress_results(progress: user_progress): Promise<void> {
  const results = Object.values(progress.results_by_lesson).flat();
  for (let index = 0; index < results.length; index += 500) {
    await api_request("/api/v1/practice-sessions/batch", {
      method: "POST",
      body: {
        sessions: results.slice(index, index + 500).map(to_practice_payload),
      },
    });
  }
}

function to_practice_payload(result: practice_result) {
  return {
    client_result_id: `${result.lesson_id}:${result.started_at}:${result.completed_at}`,
    lesson_id: result.lesson_id,
    input_source: result.input_source ?? "manual",
    started_at: result.started_at,
    completed_at: result.completed_at,
    duration_ms: result.duration_ms ?? Math.max(0, result.completed_at - result.started_at),
    bpm: result.bpm,
    last_measure_index: result.last_measure_index,
    accuracy: result.accuracy,
    mistakes: result.mistakes,
    early_steps: result.early_steps,
    late_steps: result.late_steps,
    metrics: {
      total_steps: result.total_steps,
      correct_steps: result.correct_steps,
      max_combo: result.max_combo,
      note: result.note,
    },
  };
}

function apply_snapshot(snapshot: user_snapshot): void {
  use_progress_store.getState().replace_progress(snapshot.progress);
  use_app_settings_store.getState().replace_settings(snapshot.preferences);
}

function get_current_settings(): app_settings {
  const settings = use_app_settings_store.getState();
  return {
    sidebar_collapsed: settings.sidebar_collapsed,
    free_practice: settings.free_practice,
    show_fingerings: settings.show_fingerings,
    audio_input_enabled: settings.audio_input_enabled,
    audio_calibration_midi: settings.audio_calibration_midi,
    audio_calibration_frequency: settings.audio_calibration_frequency,
    audio_tuning_offset_cents: settings.audio_tuning_offset_cents,
    calibration_field_order: settings.calibration_field_order,
    calibration_primary_fields: settings.calibration_primary_fields,
  };
}

function has_meaningful_local_data(
  progress: user_progress,
  settings: app_settings,
): boolean {
  const has_results = Object.values(progress.results_by_lesson)
    .some((results) => results.length > 0);
  if (
    progress.completed_lesson_ids.length > 0 ||
    has_results ||
    Boolean(progress.last_practiced_on)
  ) {
    return true;
  }
  return JSON.stringify(settings) !== JSON.stringify(create_initial_settings());
}

function get_error_message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function as_record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
