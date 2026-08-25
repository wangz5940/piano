import { describe, expect, it } from "vitest";

import {
  detect_pitch,
  frequency_to_midi,
  midi_to_frequency,
  midi_to_note_name,
} from "./pitch";

describe("声音音高检测", () => {
  it("可以把中央 C 的纯音识别为 C4", () => {
    const sample_rate = 48_000;
    const frequency = midi_to_frequency(60);
    const samples = new Float32Array(4096);

    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((2 * Math.PI * frequency * index) / sample_rate) * 0.5;
    }

    const detected = detect_pitch(samples, sample_rate);

    expect(detected).toBeDefined();
    expect(detected?.frequency).toBeCloseTo(frequency, 0);
    expect(detected?.clarity).toBeGreaterThan(0.8);
    expect(Math.round(frequency_to_midi(detected?.frequency ?? 0))).toBe(60);
    expect(midi_to_note_name(60)).toBe("C4");
  });

  it("安静输入不会生成音高", () => {
    const detected = detect_pitch(new Float32Array(4096), 48_000);

    expect(detected).toBeUndefined();
  });
});
