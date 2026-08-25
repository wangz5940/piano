import { describe, expect, it } from "vitest";

import {
  build_harmonized_score,
  build_right_hand_melody,
  chord_notes,
  harmonize_right_hand_score,
} from "./harmony";

const major_scale = [0, 2, 4, 5, 7, 9, 11] as const;

describe("右手谱左手和弦生成", () => {
  it("能把只有右手旋律的谱子加上 C-G-Am-F 左手根音", () => {
    const right_steps = build_right_hand_melody({
      prefix: "right-only",
      key_tonic_midi: 60,
      scale_intervals: major_scale,
      beats_per_measure: 4,
      measures: [
        { chord: "C", melody: [{ degree: 1 }, { degree: 2 }, { degree: 3 }, { degree: 5 }] },
        { chord: "G", melody: [{ degree: 5 }, { degree: 3 }, { degree: 2 }, { degree: 1 }] },
      ],
    });

    const both_hands = harmonize_right_hand_score({
      prefix: "rooted",
      right_steps,
      chords: ["C", "G", "Am", "F"],
      beats_per_measure: 4,
      style: "root",
      tonic_midi: 60,
    });

    expect(right_steps.every((step) => step.hand === "right")).toBe(true);
    expect(both_hands[0]).toMatchObject({
      hand: "both",
      notes: [48, 60],
      notation: "左 C3 + 右 1",
    });
    expect(both_hands[1]).toMatchObject({
      hand: "right",
      notes: [62],
    });
    expect(both_hands[4]).toMatchObject({
      hand: "both",
      notes: [43, 67],
      notation: "左 G2 + 右 5",
    });
  });

  it("能按和弦标记生成柱式和弦", () => {
    expect(chord_notes("C")).toEqual([48, 52, 55]);
    expect(chord_notes("Am")).toEqual([45, 48, 52]);

    const steps = build_harmonized_score({
      prefix: "block-chord",
      key_tonic_midi: 60,
      scale_intervals: major_scale,
      beats_per_measure: 4,
      style: "block",
      measures: [
        { chord: "C", melody: [{ degree: 1 }, { degree: 3 }, { degree: 5 }, { degree: 3 }] },
      ],
    });

    expect(steps[0].notes).toEqual([48, 52, 55, 60]);
    expect(steps[0].match_mode).toBe("chord");
    expect(steps[0].fingerings).toHaveLength(4);
  });

  it("结业阶段分解和弦每小节至少生成三个左手伴奏事件", () => {
    const steps = build_harmonized_score({
      prefix: "graduation",
      key_tonic_midi: 60,
      scale_intervals: major_scale,
      beats_per_measure: 4,
      style: "broken",
      measures: Array.from({ length: 32 }, (_, index) => ({
        chord: (["C", "G", "Am", "F"] as const)[index % 4],
        melody: [{ degree: 1 }, { degree: 3 }, { degree: 5 }, { degree: 3 }],
      })),
    });

    for (let measure = 1; measure <= 32; measure += 1) {
      const both_hand_events = steps.filter((step) =>
        step.measure_index === measure && step.hand === "both");
      expect(both_hand_events.length).toBeGreaterThanOrEqual(3);
      expect(both_hand_events.every((step) => step.notes.length >= 2)).toBe(true);
    }
  });
});
