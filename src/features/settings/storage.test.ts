import { afterEach, describe, expect, it, vi } from "vitest";

import { create_initial_settings, load_settings } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("学习设置存储", () => {
  it("默认开启自由学习但关闭声音输入", () => {
    expect(create_initial_settings()).toMatchObject({
      free_practice: true,
      show_fingerings: true,
      audio_input_enabled: false,
      audio_calibration_midi: 60,
      calibration_primary_fields: ["pitch_name", "duration", "fingering", "hand"],
    });
  });

  it("读取已保存的声音校准参数", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => JSON.stringify({
          sidebar_collapsed: true,
          free_practice: false,
          show_fingerings: false,
          audio_input_enabled: true,
          audio_calibration_midi: 69,
          audio_calibration_frequency: 440,
          audio_tuning_offset_cents: 1.4,
          calibration_field_order: ["staff", "pitch_name"],
          calibration_primary_fields: ["staff", "pitch_name"],
        }),
      },
    });

    expect(load_settings()).toEqual({
      sidebar_collapsed: true,
      free_practice: false,
      show_fingerings: false,
      audio_input_enabled: true,
      audio_calibration_midi: 69,
      audio_calibration_frequency: 440,
      audio_tuning_offset_cents: 1.4,
      calibration_field_order: expect.arrayContaining(["staff", "pitch_name"]),
      calibration_primary_fields: ["staff", "pitch_name"],
    });
  });
});
