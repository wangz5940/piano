import { create } from "zustand";

import {
  create_initial_settings,
  load_settings,
  save_settings,
} from "@/features/settings/storage";
import type { app_settings } from "@/features/settings/storage";

interface app_settings_store extends app_settings {
  set_sidebar_collapsed: (value: boolean) => void;
  set_free_practice: (value: boolean) => void;
  set_show_fingerings: (value: boolean) => void;
  set_audio_input_enabled: (value: boolean) => void;
  set_audio_calibration_midi: (value: number) => void;
  set_calibration_field_layout: (
    value: Pick<app_settings, "calibration_field_order" | "calibration_primary_fields">,
  ) => void;
  save_audio_calibration: (value: {
    midi: number;
    frequency: number;
    tuning_offset_cents: number;
  }) => void;
  replace_settings: (settings: app_settings) => void;
}

let on_settings_changed: ((settings: app_settings) => void) | undefined;

export function set_settings_sync_handler(
  handler: ((settings: app_settings) => void) | undefined,
): void {
  on_settings_changed = handler;
}

function persist_settings(settings: app_settings): void {
  const persisted_settings = {
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
  save_settings(persisted_settings);
  on_settings_changed?.(persisted_settings);
}

export const use_app_settings_store = create<app_settings_store>((set) => ({
  ...load_settings(),
  set_sidebar_collapsed: (value) => {
    set((state) => {
      const next_settings = { ...state, sidebar_collapsed: value };
      persist_settings(next_settings);
      return { sidebar_collapsed: next_settings.sidebar_collapsed };
    });
  },
  set_free_practice: (value) => {
    set((state) => {
      const next_settings = { ...state, free_practice: value };
      persist_settings(next_settings);
      return { free_practice: next_settings.free_practice };
    });
  },
  set_show_fingerings: (value) => {
    set((state) => {
      const next_settings = { ...state, show_fingerings: value };
      persist_settings(next_settings);
      return { show_fingerings: next_settings.show_fingerings };
    });
  },
  set_audio_input_enabled: (value) => {
    set((state) => {
      const next_settings = { ...state, audio_input_enabled: value };
      persist_settings(next_settings);
      return { audio_input_enabled: next_settings.audio_input_enabled };
    });
  },
  set_audio_calibration_midi: (value) => {
    set((state) => {
      const next_settings = { ...state, audio_calibration_midi: value };
      persist_settings(next_settings);
      return { audio_calibration_midi: next_settings.audio_calibration_midi };
    });
  },
  set_calibration_field_layout: (value) => {
    set((state) => {
      const next_settings = {
        ...state,
        calibration_field_order: value.calibration_field_order,
        calibration_primary_fields: value.calibration_primary_fields,
      };
      persist_settings(next_settings);
      return {
        calibration_field_order: next_settings.calibration_field_order,
        calibration_primary_fields: next_settings.calibration_primary_fields,
      };
    });
  },
  save_audio_calibration: (value) => {
    set((state) => {
      const next_settings = {
        ...state,
        audio_calibration_frequency: value.frequency,
        audio_calibration_midi: value.midi,
        audio_tuning_offset_cents: value.tuning_offset_cents,
      };
      persist_settings(next_settings);
      return {
        audio_calibration_frequency: next_settings.audio_calibration_frequency,
        audio_calibration_midi: next_settings.audio_calibration_midi,
        audio_tuning_offset_cents: next_settings.audio_tuning_offset_cents,
      };
    });
  },
  replace_settings: (settings) => {
    const normalized_settings = { ...create_initial_settings(), ...settings };
    save_settings(normalized_settings);
    set(normalized_settings);
  },
}));
