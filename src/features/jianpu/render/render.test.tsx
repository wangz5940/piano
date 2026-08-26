import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  expected_step,
  practice_score,
} from "@/features/course/types";
import type { jianpu_score } from "@/features/jianpu/types";

import { JianpuRenderer } from "./JianpuRenderer";
import { layout_render_score } from "./layout";
import { to_render_score_from_jianpu_score } from "./normalizeJianpuScore";
import { to_render_score_from_practice_score } from "./normalizePracticeScore";
import {
  get_duration_line_count,
  major_scale_intervals,
  midi_to_jianpu_note,
  natural_minor_scale_intervals,
} from "./pitch";

describe("统一简谱渲染核心", () => {
  it("按调式拼写音级并按拍号分母计算时值线", () => {
    expect(midi_to_jianpu_note(60, 60, major_scale_intervals)).toMatchObject({
      degree: "1",
      accidental: "",
      octave_offset: 0,
    });
    expect(midi_to_jianpu_note(61, 60, major_scale_intervals)).toMatchObject({
      degree: "1",
      accidental: "#",
    });
    expect(midi_to_jianpu_note(72, 69, natural_minor_scale_intervals)).toMatchObject({
      degree: "3",
      accidental: "",
    });
    expect(get_duration_line_count(0.25, 4)).toBe(2);
    expect(get_duration_line_count(0.5, 4)).toBe(1);
    expect(get_duration_line_count(1, 4)).toBe(0);
    expect(get_duration_line_count(1, 8)).toBe(1);
    expect(get_duration_line_count(0.333333, 4)).toBe(1);
    expect(get_duration_line_count(0.666667, 4)).toBe(0);
  });

  it("教材单手空数组不生成休止符，并保留原始起拍", () => {
    const score: jianpu_score = {
      schema_version: "1.0",
      segment_id: "single-hand",
      key_signature: "C 大调（1 = C）",
      tonic_midi: 60,
      time_signature: "4/4",
      measures: [{
        index: 1,
        number: "1",
        directions: [],
        events: [{
          onset_beats: 1.5,
          duration_beats: 0.5,
          right_notes: [60],
          left_notes: [],
        }],
      }],
    };

    const ast = to_render_score_from_jianpu_score(score);

    expect(ast.measures[0].right[0].onset_beats).toBe(1.5);
    expect(ast.measures[0].left).toHaveLength(0);
    expect(ast.measures[0].right[0].kind).toBe("note");
  });

  it("教材简谱保留校准同步的逐音指法", () => {
    const score: jianpu_score = {
      schema_version: "1.0",
      segment_id: "fingered-jianpu",
      key_signature: "C 大调（1 = C）",
      tonic_midi: 60,
      time_signature: "4/4",
      measures: [{
        index: 1,
        number: "1",
        directions: [],
        events: [{
          onset_beats: 0,
          duration_beats: 1,
          right_notes: [72],
          left_notes: [60],
          right_fingerings: [{ note: 72, finger: 1, source: "score" }],
          left_fingerings: [{ note: 60, finger: 5, source: "score" }],
        }],
      }],
    };

    const ast = to_render_score_from_jianpu_score(score);

    expect(ast.measures[0].right[0].notes[0].finger).toBe(1);
    expect(ast.measures[0].left[0].notes[0].finger).toBe(5);
  });

  it("教材简谱保留左右手独立 Slur 标记并渲染连线", () => {
    const score: jianpu_score = {
      schema_version: "1.0",
      segment_id: "slurred-jianpu",
      key_signature: "C 大调（1 = C）",
      tonic_midi: 60,
      time_signature: "4/4",
      measures: [{
        index: 1,
        number: "1",
        directions: [],
        events: [{
          onset_beats: 0,
          duration_beats: 1,
          right_notes: [72],
          left_notes: [48],
          right_slur: "start",
          left_slur: "start",
        }, {
          onset_beats: 1,
          duration_beats: 1,
          right_notes: [74],
          left_notes: [],
          right_slur: "stop",
        }, {
          onset_beats: 2,
          duration_beats: 1,
          right_notes: [],
          left_notes: [50],
          left_slur: "stop",
        }],
      }],
    };

    const ast = to_render_score_from_jianpu_score(score);
    const markup = renderToStaticMarkup(
      <JianpuRenderer score={ast} mode="reading" width={520} />,
    );

    expect(ast.measures[0].right[0].markings?.slur).toBe("start");
    expect(ast.measures[0].right[1].markings?.slur).toBe("stop");
    expect(ast.measures[0].left[0].markings?.slur).toBe("start");
    expect(ast.measures[0].left[1].markings?.slur).toBe("stop");
    expect(markup.match(/class="jianpu-svg-slur"/g)).toHaveLength(2);
    expect(markup).toContain('data-slur-lane="right"');
    expect(markup).toContain('data-slur-lane="left"');
  });

  it("拜厄 032 阅读版在中等宽度下保持每行四小节", () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../../../../public/materials/jianpu/beyer/032.json", import.meta.url),
        "utf8",
      ),
    ) as jianpu_score;
    const ast = to_render_score_from_jianpu_score(source);
    const layout = layout_render_score(ast, {
      container_width: 600,
      mode: "reading",
    });
    const mobile_layout = layout_render_score(ast, {
      container_width: 360,
      mode: "reading",
    });

    expect(layout.systems.map((system) => system.measures.length))
      .toEqual([4, 4]);
    expect(mobile_layout.systems.every((system) =>
      system.measures.length <= 2 &&
      system.measures.every((measure) =>
        measure.x + measure.width <= system.width))).toBe(true);
  });

  it("带高音点的音符与指法圈保持清晰间距", () => {
    const score: jianpu_score = {
      schema_version: "1.0",
      segment_id: "upper-dot-fingering",
      key_signature: "C 大调（1 = C）",
      tonic_midi: 60,
      time_signature: "4/4",
      measures: [{
        index: 1,
        number: "1",
        directions: [],
        events: [{
          onset_beats: 0,
          duration_beats: 1,
          right_notes: [72],
          left_notes: [],
          right_fingerings: [{ note: 72, finger: 1, source: "score" }],
        }],
      }],
    };

    const ast = to_render_score_from_jianpu_score(score);
    const layout = layout_render_score(ast, {
      container_width: 520,
      mode: "reading",
    });
    const event = layout.systems[0].measures[0].right_events[0];
    const note = event.note_boxes[0];
    const fingering = event.fingering_boxes[0];
    const octave_dot_top = note.y - 20 - 1.45;
    const fingering_circle_bottom = fingering.y + 7.5;

    expect(octave_dot_top - fingering_circle_bottom).toBeGreaterThanOrEqual(7);
    expect(fingering.y - 7.5).toBeGreaterThanOrEqual(
      layout.systems[0].right_row!.top,
    );
  });

  it("练习谱保留 6/8 分母、逐音指法和另一手延音保持", () => {
    const ast = to_render_score_from_practice_score(make_practice_score());

    expect(ast.measures[0].meter).toEqual({ beats: 6, beat_unit: 8 });
    expect(ast.measures[0].right[0].notes[0].finger).toBe(1);
    expect(ast.measures[0].left[0]).toMatchObject({
      kind: "sustain",
      onset_beats: 0,
    });
  });

  it("把手位移动和回位直接标在简谱小节上", () => {
    const score = make_practice_score({
      time_signature: "4/4",
      beats_per_measure: 4,
      measure_beats: [4, 4, 4],
      measure_beat_units: [4, 4, 4],
      finger_guide: {
        preparation: [],
        actions: [],
        success_checks: [],
        common_mistakes: [],
        position_strategy: [],
        fingering_rules: [],
        self_check: [],
        position_map: [
          {
            label: "C4 Position",
            start_note: "C4",
            notes: ["C4", "D4", "E4", "F4", "G4"],
            fingers: ["1", "2", "3", "4", "5"],
            applies_to: "C 位",
            reason: "C 位覆盖 C 到 G。",
            movement: "stay",
          },
          {
            label: "D4 Position",
            start_note: "D4",
            notes: ["D4", "E4", "F4", "G4", "A4"],
            fingers: ["1", "2", "3", "4", "5"],
            applies_to: "D 位",
            reason: "A4 出现时需要右移。",
            movement: "move",
          },
        ],
      },
      steps: [
        make_step("m1-1", 1, 0, 64, "3"),
        make_step("m1-2", 1, 1, 67, "5"),
        make_step("m1-3", 1, 2, 69, "6"),
        make_step("m1-4", 1, 3, 67, "5"),
        make_step("m2-1", 2, 0, 64, "3"),
        make_step("m2-2", 2, 1, 67, "5"),
        make_step("m2-3", 2, 2, 64, "3"),
        make_step("m2-4", 2, 3, 62, "2"),
        make_step("m3-1", 3, 0, 67, "5"),
        make_step("m3-2", 3, 1, 65, "4"),
        make_step("m3-3", 3, 2, 64, "3"),
        make_step("m3-4", 3, 3, 62, "2"),
      ],
    });

    const ast = to_render_score_from_practice_score(score);
    expect(ast.measures[0].hand_position).toMatchObject({
      label: "D4 Position",
      movement: "move",
    });
    expect(ast.measures[1].hand_position).toMatchObject({
      label: "C4 Position",
      movement: "return",
    });

    const markup = renderToStaticMarkup(
      <JianpuRenderer
        score={ast}
        mode="practice"
        show_fingerings
      />,
    );

    expect(markup).toContain('data-hand-position="D4 Position"');
    expect(markup).toContain('data-position-movement="move"');
    expect(markup).toContain("Move to D4 Position");
    expect(markup).toContain("Return to C4 Position");
    expect(markup).toContain("C4 D4 E4 F4 G4 / 12345");
  });

  it("左右手同一 onset 共享横坐标", () => {
    const score = make_practice_score({
      time_signature: "4/4",
      beats_per_measure: 4,
      measure_beats: [4],
      measure_beat_units: [4],
      steps: [{
        id: "both",
        measure_index: 1,
        beat_index: 1,
        beat_in_measure: 1,
        notation: "双手",
        note_names: ["C3", "C4"],
        notes: [48, 60],
        fingerings: [
          { note: 48, hand: "left", finger: 5, source: "score" },
          { note: 60, hand: "right", finger: 1, source: "score" },
        ],
        hand: "both",
        duration_beats: 1,
        match_mode: "chord",
      }],
    });
    const ast = to_render_score_from_practice_score(score);
    const layout = layout_render_score(ast, {
      container_width: 640,
      mode: "practice",
    });
    const measure = layout.systems[0].measures[0];

    expect(measure.right_events[0].x).toBe(measure.left_events[0].x);
  });

  it("Hanon 001 完整生成 29 小节并报告异常时间线", () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../../../../public/materials/jianpu/hanon/001.json", import.meta.url),
        "utf8",
      ),
    ) as jianpu_score;
    const ast = to_render_score_from_jianpu_score(source);
    const layout = layout_render_score(ast, {
      container_width: 760,
      mode: "reading",
    });

    expect(layout.systems.flatMap((system) => system.measures)).toHaveLength(29);
    expect(layout.systems.filter((system) => system.is_final_system)).toHaveLength(1);
    expect(layout.systems.flatMap((system) => system.measures)
      .flatMap((measure) => [
        ...measure.right_events,
        ...measure.left_events,
      ])
      .flatMap((event) => event.fingering_boxes)
      .every((box) => box.y >= 8)).toBe(true);
    expect(ast.measures[2].warnings.map((warning) => warning.code)).toContain(
      "measure_content_exceeds_declared_beats",
    );
    expect(ast.measures.some((measure) =>
      measure.warnings.some((warning) =>
        warning.code === "missing_voice_information"))).toBe(true);
  });

  it("输出按系统 SVG、左上角升号、时值线和可切换指法", () => {
    const score = make_practice_score({
      time_signature: "4/4",
      beats_per_measure: 4,
      measure_beats: [4],
      measure_beat_units: [4],
      steps: [{
        id: "sharp-note",
        measure_index: 1,
        beat_index: 0,
        beat_in_measure: 0,
        notation: "#1",
        note_names: ["C#4"],
        notes: [61],
        fingerings: [{
          note: 61,
          hand: "right",
          finger: 2,
          source: "score",
        }],
        hand: "right",
        duration_beats: 0.25,
        match_mode: "single_note",
      }],
    });
    const ast = to_render_score_from_practice_score(score);
    const hidden_markup = renderToStaticMarkup(
      <JianpuRenderer
        score={ast}
        mode="practice"
        width={600}
        show_fingerings={false}
      />,
    );
    const visible_markup = renderToStaticMarkup(
      <JianpuRenderer
        score={ast}
        mode="practice"
        width={600}
        show_fingerings
      />,
    );

    expect(hidden_markup).toContain('data-jianpu-system="0"');
    expect(hidden_markup).toContain('data-simpmusic-fonts="base accent"');
    expect(hidden_markup).toContain('data-simpmusic-font="base"');
    expect(hidden_markup).toContain('data-jianpu-accidental="#"');
    expect(hidden_markup).toContain(">L</text>");
    expect(hidden_markup).toContain('data-duration-lines="2"');
    const note_x = hidden_markup.match(
      /class="jianpu-svg-degree"[^>]*x="([^"]+)"[^>]*text-anchor="start"/,
    )?.[1];
    const duration_line_x = hidden_markup.match(
      /class="jianpu-svg-duration-lines"[\s\S]*?<line[^>]*x1="([^"]+)"/,
    )?.[1];
    expect(duration_line_x).toBe(note_x);
    expect(hidden_markup).not.toContain("jianpu-svg-fingering");
    expect(visible_markup).toContain("jianpu-svg-fingering");
    expect(visible_markup.match(/is-final/g)).toHaveLength(1);
  });

  it("把保持状态与正式延音线分开绘制", () => {
    const ast = to_render_score_from_practice_score(make_practice_score());
    const markup = renderToStaticMarkup(
      <JianpuRenderer score={ast} mode="practice" width={600} />,
    );

    expect(markup).toContain('data-jianpu-sustain="true"');
    expect(markup).not.toContain("jianpu-svg-sustain-curve");
    expect(markup).not.toContain("jianpu-svg-tie");
  });

  it("传统双手简谱每行最多四小节并保持固定长度分段延音", () => {
    const ast = to_render_score_from_practice_score(make_canon_like_score());
    const layout = layout_render_score(ast, {
      container_width: 960,
      mode: "practice",
    });
    const mobile_layout = layout_render_score(ast, {
      container_width: 360,
      mode: "practice",
    });
    const measure_widths = layout.systems
      .flatMap((system) => system.measures)
      .map((measure) => measure.width.toFixed(4));
    const first_right_event = layout.systems[0].measures[0].right_events[0];
    const hold_widths = first_right_event.hold_segments.map((segment) =>
      segment.width.toFixed(4));

    expect(layout.systems).toHaveLength(2);
    expect(layout.systems.map((system) => system.measures.length))
      .toEqual([4, 4]);
    expect(layout.systems.every((system) => system.height < 250)).toBe(true);
    expect(mobile_layout.systems.every((system) =>
      system.measures.length <= 2 &&
      system.measures.every((measure) =>
        measure.x + measure.width <= system.width))).toBe(true);
    expect(new Set(measure_widths)).toHaveLength(1);
    expect(first_right_event.hold_segments).toHaveLength(3);
    expect(new Set(hold_widths)).toHaveLength(1);
    expect(first_right_event.hold_segments[1].x -
      (first_right_event.hold_segments[0].x +
        first_right_event.hold_segments[0].width)).toBeGreaterThan(6);

    const markup = renderToStaticMarkup(
      <JianpuRenderer score={ast} mode="practice" width={960} />,
    );
    expect(markup).toContain('data-traditional-jianpu="true"');
    expect(markup).toContain(">(1)</text>");
    expect(markup).toContain(">(5)</text>");
    expect(markup).not.toContain("jianpu-svg-warning");
    expect(markup).toContain('data-jianpu-hold-count="3"');
  });

  it("低音和弦使用紧凑堆叠并为低音点留出空间", () => {
    const ast = to_render_score_from_practice_score(make_canon_like_score());
    const layout = layout_render_score(ast, {
      container_width: 960,
      mode: "practice",
    });
    const left_chord = layout.systems[0].measures[0].left_events[0];
    const y_positions = left_chord.note_boxes.map((box) => box.y);
    const gaps = y_positions.slice(1).map((y, index) =>
      y_positions[index] - y);

    expect(left_chord.note_boxes.some((box) => box.note.octave_offset < 0))
      .toBe(true);
    expect(gaps.every((gap) => gap >= 20)).toBe(true);
  });
});

function make_practice_score(
  overrides: Partial<practice_score> = {},
): practice_score {
  return {
    id: "render-fixture",
    title: "渲染样本",
    key_signature: "C 大调（1 = C）",
    jianpu_tonic_midi: 60,
    time_signature: "6/8",
    beats_per_measure: 6,
    tempo_hint: "慢速",
    start_position: "中央 C",
    finger_hint: "右手 1 指",
    finger_guide: {
      preparation: [],
      actions: [],
      success_checks: [],
      common_mistakes: [],
      position_strategy: [],
      fingering_rules: [],
      self_check: [],
      position_map: [],
    },
    source: {
      kind: "inline",
      status: "published",
      label: "测试",
    },
    measure_beats: [6],
    measure_beat_units: [8],
    steps: [{
      id: "right-with-left-hold",
      measure_index: 1,
      beat_index: 0,
      beat_in_measure: 0,
      notation: "1",
      note_names: ["C4"],
      notes: [60],
      fingerings: [{
        note: 60,
        hand: "right",
        finger: 1,
        source: "score",
      }],
      held_hands: ["left"],
      hand: "right",
      duration_beats: 1,
      match_mode: "single_note",
    }],
    ...overrides,
  };
}

function make_step(
  id: string,
  measure_index: number,
  beat_in_measure: number,
  note: number,
  notation: string,
): expected_step {
  return {
    id,
    measure_index,
    beat_index: (measure_index - 1) * 4 + beat_in_measure,
    beat_in_measure,
    notation,
    note_names: [String(note)],
    notes: [note],
    fingerings: [{
      note,
      hand: "right",
      finger: notation === "6" ? 5 : notation === "5" ? 4 : notation === "4" ? 3 : notation === "3" ? 2 : 1,
      source: "score",
    }],
    hand: "right",
    duration_beats: 1,
    match_mode: "single_note",
  };
}

function make_canon_like_score(): practice_score {
  const steps: expected_step[] = Array.from({ length: 8 }, (_, index) => ({
    id: `canon-${index + 1}`,
    measure_index: index + 1,
    beat_index: index * 4,
    beat_in_measure: 0,
    notation: index % 2 === 0 ? "D" : "A",
    note_names: ["D3", "F#3", "A3", "F#4", "A4"],
    notes: [50, 54, 57, 66, 69],
    fingerings: [
      { note: 50, hand: "left", finger: 5, source: "score" },
      { note: 54, hand: "left", finger: 3, source: "score" },
      { note: 57, hand: "left", finger: 1, source: "score" },
      { note: 66, hand: "right", finger: 1, source: "score" },
      { note: 69, hand: "right", finger: 3, source: "score" },
    ],
    hand: "both" as const,
    duration_beats: 4,
    match_mode: "chord" as const,
  }));

  return make_practice_score({
    id: "canon-grid-fixture",
    title: "卡农固定网格样本",
    key_signature: "D 大调（1 = D）",
    jianpu_tonic_midi: 62,
    time_signature: "4/4",
    beats_per_measure: 4,
    measure_beats: Array.from({ length: 8 }, () => 4),
    measure_beat_units: Array.from({ length: 8 }, () => 4),
    steps,
  });
}
