import {
  all_calibration_fields,
  default_primary_calibration_fields,
  load_calibration_field_order,
  load_primary_calibration_field_order,
  normalize_calibration_field_order,
  normalize_primary_calibration_fields,
  type calibration_field,
} from "@/features/calibration/calibrationFieldOrder";

export interface app_settings {
  sidebar_collapsed: boolean;
  free_practice: boolean;
  show_fingerings: boolean;
  audio_input_enabled: boolean;
  audio_calibration_midi: number;
  audio_calibration_frequency?: number;
  audio_tuning_offset_cents: number;
  calibration_field_order: calibration_field[];
  calibration_primary_fields: calibration_field[];
}

const storage_key = "lianqinbu.settings.v1";

export function create_initial_settings(): app_settings {
  return {
    sidebar_collapsed: false,
    free_practice: true,
    show_fingerings: true,
    audio_input_enabled: false,
    audio_calibration_midi: 60,
    audio_calibration_frequency: undefined,
    audio_tuning_offset_cents: 0,
    calibration_field_order: [...all_calibration_fields],
    calibration_primary_fields: [...default_primary_calibration_fields],
  };
}

export function load_settings(): app_settings {
  if (typeof window === "undefined") {
    return create_initial_settings();
  }

  try {
    const saved_settings = window.localStorage.getItem(storage_key);
    if (!saved_settings) {
      return {
        ...create_initial_settings(),
        calibration_field_order: load_calibration_field_order(window.localStorage),
        calibration_primary_fields: load_primary_calibration_field_order(window.localStorage),
      };
    }

    const parsed_settings = JSON.parse(saved_settings) as Partial<app_settings>;
    const calibration_field_order = parsed_settings.calibration_field_order
      ? normalize_calibration_field_order(parsed_settings.calibration_field_order)
      : load_calibration_field_order(window.localStorage);
    return {
      ...create_initial_settings(),
      sidebar_collapsed: parsed_settings.sidebar_collapsed === true,
      free_practice: parsed_settings.free_practice !== false,
      show_fingerings: parsed_settings.show_fingerings !== false,
      audio_input_enabled: parsed_settings.audio_input_enabled === true,
      audio_calibration_midi: is_valid_midi(parsed_settings.audio_calibration_midi)
        ? parsed_settings.audio_calibration_midi
        : 60,
      audio_calibration_frequency: is_valid_frequency(parsed_settings.audio_calibration_frequency)
        ? parsed_settings.audio_calibration_frequency
        : undefined,
      audio_tuning_offset_cents: typeof parsed_settings.audio_tuning_offset_cents === "number" &&
        Number.isFinite(parsed_settings.audio_tuning_offset_cents)
        ? parsed_settings.audio_tuning_offset_cents
        : 0,
      calibration_field_order,
      calibration_primary_fields: parsed_settings.calibration_primary_fields
        ? normalize_primary_calibration_fields(
            parsed_settings.calibration_primary_fields,
            calibration_field_order,
          )
        : load_primary_calibration_field_order(window.localStorage),
    };
  } catch {
    return create_initial_settings();
  }
}

export function save_settings(settings: app_settings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storage_key, JSON.stringify(settings));
}

function is_valid_midi(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 21 && value <= 108;
}

function is_valid_frequency(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
