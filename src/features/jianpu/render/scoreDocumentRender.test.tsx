import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  score_annotation,
  score_document_v2,
  score_hand_position_movement,
} from "@/features/score";

import type { jianpu_event_markings } from "./model";
import { JianpuRenderer } from "./JianpuRenderer";
import { layout_render_score } from "./layout";
import { to_render_score_from_score_document } from "./normalizeScoreDocument";
import { StaffAidRenderer } from "./StaffAidRenderer";

describe("ScoreDocument v2 教学 SVG", () => {
  it("从 v2 派生歌词、指法、和弦和 Position → Move → Return", () => {
    const ast = to_render_score_from_score_document(make_score_document());

    expect(ast.measures.map((measure) => measure.hand_position?.movement))
      .toEqual(["stay", "move", "return"]);
    expect(ast.measures.map((measure) => measure.lyric_labels[0]?.text))
      .toEqual(["主爱引领", "向前跨步", "安稳归回"]);
    expect(ast.measures.map((measure) => measure.chord_labels[0]?.source))
      .toEqual(["pptx", "manual", "generated"]);
    expect(ast.measures[1].right[0].notes[0]).toMatchObject({
      finger: 1,
      fingering_source: "generated",
      fingering_status: "candidate",
    });

    const jianpu = renderToStaticMarkup(
      <JianpuRenderer
        score={ast}
        mode="practice"
        show_fingerings
        width={760}
      />,
    );
    const staff = renderToStaticMarkup(
      <StaffAidRenderer score={ast} show_fingerings />,
    );

    for (const markup of [jianpu, staff]) {
      expect(markup).toContain("Position: C4 Position");
      expect(markup).toContain("Move to D4 Position");
      expect(markup).toContain("Return to C4 Position");
      expect(markup).toContain("主爱引领");
      expect(markup).toContain('data-annotation-source="pptx"');
      expect(markup).toContain('data-annotation-source="manual"');
      expect(markup).toContain('data-annotation-source="generated"');
      expect(markup).toContain('data-annotation-status="candidate"');
      expect(markup).toContain("is-move");
      expect(markup).toContain("is-return");
    }
    expect(jianpu).toContain("jianpu-svg-lyric");
    expect(jianpu).toContain('data-simpmusic-font="base"');
    expect(jianpu).toContain('data-simpmusic-font="accent"');
    expect(jianpu).toContain('class="jianpu-svg-tie"');
    expect(jianpu).toContain(">-</text>");
    expect(staff).toContain('data-staff-aid="true"');
    expect(staff).toContain("staff-lyric");
  });

  it("不同 SVG 宽度下时间轴相对坐标和结构保持稳定", () => {
    const ast = to_render_score_from_score_document(make_score_document());
    const narrow = layout_render_score(ast, {
      container_width: 520,
      mode: "practice",
    });
    const wide = layout_render_score(ast, {
      container_width: 920,
      mode: "practice",
    });
    const narrow_measure = narrow.systems[0].measures[0];
    const wide_measure = wide.systems[0].measures[0];
    const narrow_ratio = (
      narrow_measure.right_events[0].x - narrow_measure.content_x
    ) / narrow_measure.content_width;
    const wide_ratio = (
      wide_measure.right_events[0].x - wide_measure.content_x
    ) / wide_measure.content_width;

    expect(narrow_ratio).toBeCloseTo(wide_ratio, 8);
    expect(narrow.systems.flatMap((system) => system.measures)).toHaveLength(3);
    expect(wide.systems.flatMap((system) => system.measures)).toHaveLength(3);

    const narrow_markup = renderToStaticMarkup(
      <JianpuRenderer score={ast} mode="practice" width={520} show_fingerings />,
    );
    const wide_markup = renderToStaticMarkup(
      <JianpuRenderer score={ast} mode="practice" width={920} show_fingerings />,
    );
    expect(narrow_markup.match(/preserveAspectRatio="xMinYMin meet"/g)?.length)
      .toBe(narrow.systems.length);
    expect(wide_markup.match(/preserveAspectRatio="xMinYMin meet"/g)?.length)
      .toBe(wide.systems.length);
    expect(narrow_markup.match(/data-measure-index=/g)).toHaveLength(3);
    expect(wide_markup.match(/data-measure-index=/g)).toHaveLength(3);
  });

  it("五线谱按权威时值派生符头、符尾和休止符", () => {
    const document = make_score_document();
    document.measures[0].events[0].duration_beats = 2;
    document.measures[1].events[0].duration_beats = 0.5;
    document.measures[1].events[0].notes = [];
    document.measures[2].events[0].duration_beats = 0.5;
    const markup = renderToStaticMarkup(
      <StaffAidRenderer
        score={to_render_score_from_score_document(document)}
      />,
    );

    expect(markup).toContain('data-duration-kind="half"');
    expect(markup).toContain("staff-notehead is-open");
    expect(markup).toContain('data-duration-kind="eighth"');
    expect(markup).toContain("staff-flags");
    expect(markup).toContain("𝄾");
  });

  it("左手 G4 按音域映射到高音谱表第二线，避免大谱表中间额外加线", () => {
    const document = make_score_document();
    document.measures = [{
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "left-g4",
        onset_beats: 0,
        duration_beats: 1,
        hand: "left",
        voice: 2,
        notes: [{
          id: "left-g4-note",
          midi: 67,
          source_refs: [],
        }],
        source_refs: [],
      }, {
        id: "left-c3",
        onset_beats: 1,
        duration_beats: 1,
        hand: "left",
        voice: 2,
        notes: [{
          id: "left-c3-note",
          midi: 48,
          source_refs: [],
        }],
        source_refs: [],
      }],
    }];
    const markup = renderToStaticMarkup(
      <StaffAidRenderer
        score={to_render_score_from_score_document(document)}
      />,
    );

    expect(markup).toContain('data-event-id="left-g4"');
    expect(markup).toContain('data-hand="left"');
    expect(markup).toContain('data-staff="treble"');
    expect(markup).toContain('data-midi="67"');
    expect(markup).toContain('cy="83"');
    expect(markup).not.toContain("staff-ledger-line");
  });

  it("校准五线谱可按左右手拆为独立谱表，降低双手同拍事件密度", () => {
    const document = make_score_document();
    document.measures = [{
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "right-c5",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ id: "right-c5-note", midi: 72, source_refs: [] }],
        source_refs: [],
      }, {
        id: "left-c4",
        onset_beats: 0,
        duration_beats: 4,
        hand: "left",
        voice: 2,
        notes: [{ id: "left-c4-note", midi: 60, source_refs: [] }],
        source_refs: [],
      }],
    }];
    const metadata: Record<string, jianpu_event_markings> = {
      "right-c5": { slur: "start" as const },
      "left-c4": { slur: "start" as const },
    };
    document.measures[0].events.push({
      id: "right-d5",
      onset_beats: 1,
      duration_beats: 1,
      hand: "right",
      voice: 1,
      notes: [{ id: "right-d5-note", midi: 74, source_refs: [] }],
      source_refs: [],
    });
    metadata["right-d5"] = { slur: "stop" };
    const score = to_render_score_from_score_document(document, metadata);
    const markup = renderToStaticMarkup(
      <StaffAidRenderer
        score={score}
        group_by_hand
      />,
    );
    const jianpu_markup = renderToStaticMarkup(
      <JianpuRenderer
        score={score}
        mode="reading"
        width={520}
        show_fingerings
      />,
    );

    expect(markup).toContain('data-staff-aid-layout="by-hand"');
    expect(markup).toContain('data-staff-aid-hand="right"');
    expect(markup).toContain('data-staff-aid-hand="left"');
    expect(markup).toContain('data-event-id="right-c5"');
    expect(markup).toContain('data-event-id="left-c4"');
    expect(markup).toContain('data-slur-from="right-c5"');
    expect(markup).toContain('data-slur-to="right-d5"');
    expect(jianpu_markup).toContain('data-slur-from="right-c5"');
    expect(jianpu_markup).toContain('data-slur-to="right-d5"');
    expect(jianpu_markup.match(/class="jianpu-svg-slur"/g)).toHaveLength(1);
  });

  it("简谱和自绘五线谱按同手栈后进先出渲染嵌套 Slur", () => {
    const document = make_score_document();
    document.measures = [{
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "right-outer-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ id: "right-outer-start-note", midi: 72, source_refs: [] }],
        source_refs: [],
      }, {
        id: "right-inner-start",
        onset_beats: 1,
        duration_beats: 1,
        hand: "right",
        voice: 2,
        notes: [{ id: "right-inner-start-note", midi: 74, source_refs: [] }],
        source_refs: [],
      }, {
        id: "left-stop",
        onset_beats: 1.5,
        duration_beats: 1,
        hand: "left",
        voice: 2,
        notes: [{ id: "left-stop-note", midi: 48, source_refs: [] }],
        source_refs: [],
      }, {
        id: "right-inner-stop",
        onset_beats: 2,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ id: "right-inner-stop-note", midi: 76, source_refs: [] }],
        source_refs: [],
      }, {
        id: "right-outer-stop",
        onset_beats: 3,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ id: "right-outer-stop-note", midi: 77, source_refs: [] }],
        source_refs: [],
      }],
    }];
    const metadata: Record<string, jianpu_event_markings> = {
      "right-outer-start": { slur: "start" },
      "right-inner-start": { slur: "start" },
      "left-stop": { slur: "stop" },
      "right-inner-stop": { slur: "stop" },
      "right-outer-stop": { slur: "stop" },
    };
    const score = to_render_score_from_score_document(document, metadata);
    const staff_markup = renderToStaticMarkup(
      <StaffAidRenderer score={score} />,
    );
    const jianpu_markup = renderToStaticMarkup(
      <JianpuRenderer score={score} mode="reading" width={520} />,
    );

    for (const markup of [staff_markup, jianpu_markup]) {
      expect(markup).toContain('data-slur-from="right-inner-start"');
      expect(markup).toContain('data-slur-to="right-inner-stop"');
      expect(markup).toContain('data-slur-from="right-outer-start"');
      expect(markup).toContain('data-slur-to="right-outer-stop"');
      expect(markup).not.toContain('data-slur-from="right-inner-start" data-slur-to="left-stop"');
    }
    expect(staff_markup.match(/class="staff-slur"/g)).toHaveLength(2);
    expect(jianpu_markup.match(/class="jianpu-svg-slur"/g)).toHaveLength(2);
  });

  it("自绘五线谱按同手同声部同音高渲染延音线", () => {
    const document = make_score_document();
    document.measures = [{
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "tie-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "start",
        notes: [{ id: "tie-start-note", midi: 72, source_refs: [] }],
        source_refs: [],
      }, {
        id: "tie-continue",
        onset_beats: 1,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "continue",
        notes: [{ id: "tie-continue-note", midi: 72, source_refs: [] }],
        source_refs: [],
      }, {
        id: "tie-stop",
        onset_beats: 2,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "stop",
        notes: [{ id: "tie-stop-note", midi: 72, source_refs: [] }],
        source_refs: [],
      }, {
        id: "same-voice-different-pitch",
        onset_beats: 3,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "stop",
        notes: [{ id: "same-voice-different-pitch-note", midi: 74, source_refs: [] }],
        source_refs: [],
      }],
    }];
    const markup = renderToStaticMarkup(
      <StaffAidRenderer
        score={to_render_score_from_score_document(document)}
      />,
    );

    expect(markup.match(/class="staff-tie"/g)).toHaveLength(2);
    expect(markup).toContain('data-tie-from="tie-start"');
    expect(markup).toContain('data-tie-to="tie-continue"');
    expect(markup).toContain('data-tie-from="tie-continue"');
    expect(markup).toContain('data-tie-to="tie-stop"');
    expect(markup).not.toContain('data-tie-to="same-voice-different-pitch"');
  });

  it("简谱 Slur 以音符视觉中心为锚点，长时值不会把连线推离目标音符", () => {
    const document = make_score_document();
    document.measures = [{
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "left-long-start",
        onset_beats: 0,
        duration_beats: 4,
        hand: "left",
        voice: 2,
        notes: [{ id: "left-long-start-note", midi: 60, finger: 5, source_refs: [] }],
        source_refs: [],
      }],
    }, {
      id: "measure-2",
      number: "2",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "left-stop",
        onset_beats: 0,
        duration_beats: 1,
        hand: "left",
        voice: 2,
        notes: [{ id: "left-stop-note", midi: 60, finger: 5, source_refs: [] }],
        source_refs: [],
      }],
    }];
    const metadata: Record<string, jianpu_event_markings> = {
      "left-long-start": { slur: "start" },
      "left-stop": { slur: "stop" },
    };
    const score = to_render_score_from_score_document(document, metadata);
    const layout = layout_render_score(score, {
      container_width: 520,
      mode: "reading",
    });
    const start_box = layout.systems[0].measures[0].left_events[0];
    const stop_box = layout.systems[0].measures[1].left_events[0];
    const markup = renderToStaticMarkup(
      <JianpuRenderer
        score={score}
        mode="reading"
        width={520}
        show_fingerings
      />,
    );
    const path = markup.match(/class="jianpu-svg-slur"[^>]*d="([^"]+)"/)?.[1];
    const points = path?.match(
      /^M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)$/u,
    )?.slice(1).map(Number);

    expect(points).toBeDefined();
    const [start_x, start_y, , control_y, stop_x, stop_y] = points!;
    expect(start_x).toBeCloseTo(start_box.note_boxes[0].x + 6, 4);
    expect(stop_x).toBeCloseTo(stop_box.note_boxes[0].x + 6, 4);
    expect(start_y).toBeCloseTo(start_box.note_boxes[0].y - 14, 4);
    expect(stop_y).toBeCloseTo(stop_box.note_boxes[0].y - 14, 4);
    expect(control_y).toBeGreaterThanOrEqual(start_y - 18);
  });
});

function make_score_document(): score_document_v2 {
  const movements: score_hand_position_movement[] = [
    "stay",
    "move",
    "return",
  ];
  const roots = [60, 62, 60];
  const notes = [62, 62, 64];
  const fingers = [2, 1, 3] as const;
  const chords = [
    { text: "C", source: "pptx" as const },
    { text: "Dm", source: "manual" as const },
    { text: "C", source: "generated" as const },
  ];
  const lyric_texts = ["主爱引领", "向前跨步", "安稳归回"];

  return {
    schema_version: 2,
    id: "score-document-render",
    number: "999",
    title: "ScoreDocument render",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status: "candidate",
    provenance: {
      kind: "pptx",
      source_id: "pptx-render",
      source_file: "render.pptx",
      source_sha256: "b".repeat(64),
      font_config_version: "font-v1",
      importer_version: "importer-v1",
      references: [],
    },
    lyrics: lyric_texts.map((text, index) => ({
      id: `lyric-${index + 1}`,
      stanza_number: 1,
      text,
      language: "zh-CN",
      event_ids: [`event-${index + 1}`],
      range: {
        start: { measure_id: `measure-${index + 1}`, beat: 1 },
        end: { measure_id: `measure-${index + 1}`, beat: 2 },
      },
      slide_number: index + 1,
      annotation: annotation("pptx", "PPTX 乐句级歌词。"),
    })),
    hand_positions: movements.map((movement, index) => ({
      id: `position-${index + 1}`,
      hand: "right",
      range: {
        start: { measure_id: `measure-${index + 1}`, beat: 0 },
        end: { measure_id: `measure-${index + 1}`, beat: 4 },
      },
      position_name: `${index === 1 ? "D4" : "C4"} Position`,
      covered_midis: scale_position(roots[index]),
      finger_map: scale_position(roots[index]).map((midi, finger_index) => ({
        finger: (finger_index + 1) as 1 | 2 | 3 | 4 | 5,
        midi,
      })),
      movement,
      annotation: annotation(
        "generated",
        `${movement} 由调性、乐句音域和相邻小节生成。`,
      ),
    })),
    measures: notes.map((midi, index) => ({
      id: `measure-${index + 1}`,
      number: String(index + 1),
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: `event-${index + 1}`,
        onset_beats: 1,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: index === 0 ? "start" : undefined,
        notes: [{
          id: `note-${index + 1}`,
          midi,
          finger: fingers[index],
          fingering: annotation(
            "generated",
            "结合当前手位、前后音和乐句方向生成。",
          ),
          source_refs: [],
        }],
        chord: chords[index].text,
        chord_annotation: annotation(
          chords[index].source,
          `${chords[index].source} 和弦来源。`,
        ),
        source_refs: [],
      }],
    })),
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: null,
      published_at: null,
      note: null,
    },
  };
}

function annotation(
  source: score_annotation["source"],
  reason: string,
): score_annotation {
  return {
    source,
    status: "candidate",
    reason,
    confirmed_by: null,
    confirmed_at: null,
    source_refs: [],
  };
}

function scale_position(root: number): number[] {
  return root === 62
    ? [62, 64, 65, 67, 69]
    : [60, 62, 64, 65, 67];
}
