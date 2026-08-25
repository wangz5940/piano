import { describe, expect, it } from "vitest";

import { computer_keyboard_map } from "@/features/practice/computerKeyboard";

import { get_keyboard_range } from "./pianoKeyboardRange";

describe("电脑钢琴键盘", () => {
  it("在欢乐颂从 4 进行到 5 时保持相同的可见键位范围", () => {
    const fourth = get_keyboard_range([65]);
    const fifth = get_keyboard_range([67]);

    expect(fourth.white_keys.map((key) => key.midi)).toEqual(
      fifth.white_keys.map((key) => key.midi),
    );
    expect(fifth.white_keys.map((key) => key.midi)).toContain(60);
    expect(fifth.white_keys.map((key) => key.midi)).toContain(72);
  });

  it("保持 A 到 K 的中央 C 键位映射", () => {
    expect(computer_keyboard_map.get("d")).toBe(64);
    expect(computer_keyboard_map.get("f")).toBe(65);
    expect(computer_keyboard_map.get("g")).toBe(67);
  });
});
