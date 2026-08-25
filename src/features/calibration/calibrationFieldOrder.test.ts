import { describe, expect, it } from "vitest";

import {
  all_calibration_fields,
  default_primary_calibration_fields,
  load_calibration_field_order,
  load_primary_calibration_field_order,
  move_calibration_field,
  normalize_calibration_field_order,
  normalize_primary_calibration_fields,
  primary_calibration_fields,
  save_calibration_field_order,
  save_primary_calibration_fields,
} from "./calibrationFieldOrder";

describe("校准字段布局", () => {
  it("默认将音名、时值、指法、手别放在主要校准项", () => {
    expect(primary_calibration_fields).toEqual([
      "pitch_name",
      "duration",
      "fingering",
      "hand",
    ]);
    expect(default_primary_calibration_fields).toEqual(primary_calibration_fields);
    expect(all_calibration_fields).toContain("measure_number");
    expect(all_calibration_fields).toContain("pitch_midi");
  });

  it("支持移动任意校准字段并修复旧版或损坏的顺序", () => {
    const moved = move_calibration_field(
      all_calibration_fields,
      "measure_number",
      -1,
    );

    expect(moved.indexOf("measure_number"))
      .toBe(all_calibration_fields.indexOf("measure_number") - 1);
    expect(normalize_calibration_field_order(["hand", "hand", "unknown"]))
      .toEqual(["hand", ...all_calibration_fields.filter((field) => field !== "hand")]);
  });

  it("支持动态管理主要校准项", () => {
    expect(normalize_primary_calibration_fields([
      "hand",
      "staff",
      "hand",
      "unknown",
    ], all_calibration_fields)).toEqual(["hand", "staff"]);
    expect(normalize_primary_calibration_fields([], all_calibration_fields))
      .toEqual([]);
  });

  it("保存并恢复全量字段顺序和主要字段集合", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const order = move_calibration_field(all_calibration_fields, "staff", -1);
    const primary = ["staff", "pitch_name", "duration"] as const;

    save_calibration_field_order(order, storage);
    save_primary_calibration_fields(primary, storage);

    expect(load_calibration_field_order(storage)).toEqual(order);
    expect(load_primary_calibration_field_order(storage)).toEqual([
      "pitch_name",
      "duration",
      "staff",
    ]);
  });

  it("从旧版主要字段顺序迁移全量字段顺序", () => {
    const values = new Map<string, string>([
      [
        "panio.calibration.primary-field-order.v1",
        JSON.stringify(["hand", "pitch_name", "duration", "fingering"]),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(load_calibration_field_order(storage).slice(0, 4)).toEqual([
      "hand",
      "pitch_name",
      "duration",
      "fingering",
    ]);
    expect(load_primary_calibration_field_order(storage)).toEqual([
      "hand",
      "pitch_name",
      "duration",
      "fingering",
    ]);
  });
});
