import { afterEach, expect, it, vi } from "vitest";
import { clear_jianpu_library_cache, load_jianpu_score } from "./loadJianpuLibrary";
import { to_render_score_from_jianpu_score } from "./render/normalizeJianpuScore";

afterEach(() => {
  clear_jianpu_library_cache();
  vi.unstubAllGlobals();
});

it("教材简谱加载与渲染保留中途换拍、换调和另一只手的休止", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    schema_version: "1.0",
    segment_id: "test",
    time_signature: "4/4",
    key_signature: "C major",
    tonic_midi: 60,
    measures: [{
      index: 1, number: "1", directions: [],
      events: [{ onset_beats: 0, duration_beats: 4, right_notes: [60], left_notes: [] }],
    }, {
      index: 2, number: "1", directions: [],
      meter: { beats: 3, beat_unit: 4 },
      key_signature: "G major", tonic_midi: 67,
      events: [{
        onset_beats: 0, duration_beats: 3,
        right_notes: [67], left_notes: [], left_rest: true,
      }],
    }],
  }))));
  const loaded = await load_jianpu_score("/test.json");
  const rendered = to_render_score_from_jianpu_score(loaded);
  expect(rendered.measures.map((measure) => measure.meter.beats)).toEqual([4, 3]);
  expect(rendered.measures[1].right[0].notes[0].degree).toBe("1");
  expect(rendered.measures[1].left[0]).toMatchObject({
    kind: "rest", duration_beats: 3, notes: [],
  });
  expect(rendered.measures[0].left).toEqual([]);
  expect(rendered.measures[1].warnings).toEqual([]);
});
