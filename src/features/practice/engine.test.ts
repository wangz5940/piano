import { describe, expect, it } from "vitest";

import { evaluate_input, get_accuracy, get_beat_duration_ms } from "./engine";

describe("练习判定引擎", () => {
  it("单音命中时通过并保留稳定节拍标记", () => {
    const result = evaluate_input({
      expected_notes: [60],
      received_note: 60,
      collected_notes: [],
      expected_at: 1_000,
      timestamp: 1_120,
    });

    expect(result).toEqual({
      kind: "hit",
      timing: "稳定",
      accepted_notes: [60],
    });
  });

  it("错误音不应推进目标和弦", () => {
    const result = evaluate_input({
      expected_notes: [48, 64],
      received_note: 50,
      collected_notes: [48],
      timestamp: 1_000,
    });

    expect(result.kind).toBe("wrong");
    expect(result.accepted_notes).toEqual([]);
  });

  it("和弦在收集完所有目标音前保持部分命中状态", () => {
    const partial = evaluate_input({
      expected_notes: [48, 64],
      received_note: 48,
      collected_notes: [],
      timestamp: 1_000,
    });
    const complete = evaluate_input({
      expected_notes: [48, 64],
      received_note: 64,
      collected_notes: partial.accepted_notes,
      timestamp: 1_080,
    });

    expect(partial.kind).toBe("partial");
    expect(complete.kind).toBe("hit");
    expect(complete.accepted_notes).toEqual([48, 64]);
  });

  it("和弦音超过同时落键窗口后重新开始收集", () => {
    const result = evaluate_input({
      expected_notes: [48, 64],
      received_note: 64,
      collected_notes: [48],
      collected_started_at: 1_000,
      timestamp: 1_400,
    });

    expect(result.kind).toBe("partial");
    expect(result.accepted_notes).toEqual([64]);
  });

  it("正确率按正确步骤与错误尝试共同计算", () => {
    expect(get_accuracy(4, 1)).toBe(0.8);
    expect(get_accuracy(0, 0)).toBe(0);
  });

  it("速度能稳定换算为每拍毫秒数", () => {
    expect(get_beat_duration_ms(60)).toBe(1_000);
    expect(get_beat_duration_ms(120)).toBe(500);
  });
});
