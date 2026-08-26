import { describe, expect, it } from "vitest";

import { create_calibration_project } from "./storage";
import {
  apply_slur_marking,
  build_notation_sync_map,
  synchronize_notation_change,
  synchronize_project_notation_metadata,
  validate_notation_sync,
} from "./notationSync";

describe("简谱与五线谱双向同步", () => {
  it("用稳定事件和音符 ID 建立双向映射", () => {
    const project = make_project();

    expect(build_notation_sync_map(project)).toEqual([
      expect.objectContaining({
        event_id: "event-1",
        measure_id: "measure-1",
        jianpu_element_id: "jianpu:event-1",
        staff_element_id: "staff:event-1",
        duration_beats: 1,
        dynamics: "mf",
        notes: [{
          note_id: "note-1",
          midi: 60,
          pitch_name: "C4",
        }],
      }),
    ]);
  });

  it("把任一视图的音高、节奏、休止、拍号和力度变更写回权威模型", () => {
    let project = make_project();
    project = synchronize_notation_change(project, {
      origin: "staff",
      kind: "pitch",
      event_id: "event-1",
      note_id: "note-1",
      midi: 66,
    });
    project = synchronize_notation_change(project, {
      origin: "jianpu",
      kind: "rhythm",
      event_id: "event-1",
      onset_beats: 1,
      duration_beats: 2,
    });
    project = synchronize_notation_change(project, {
      origin: "staff",
      kind: "event_metadata",
      event_id: "event-1",
      dynamics: "ff",
      articulation: "accent",
      slur: "start",
    });
    project = synchronize_notation_change(project, {
      origin: "jianpu",
      kind: "signature",
      key_signature: "G major",
      time_signature: "3/4",
    });

    const event = project.document.measures[0].events[0];
    expect(event).toMatchObject({
      onset_beats: 1,
      duration_beats: 2,
      notes: [{ id: "note-1", midi: 66 }],
    });
    expect(project.event_metadata["event-1"]).toMatchObject({
      pitch_name: "F#4",
      duration_label: "half",
      beat_position: "2",
      dynamics: "ff",
      articulation: "accent",
      slur: "start",
    });
    expect(project.document).toMatchObject({
      key_signature: "G major",
      time_signature: "3/4",
    });
    expect(project.document.measures[0].meter).toEqual({
      beats: 3,
      beat_unit: 4,
    });

    project = synchronize_notation_change(project, {
      origin: "staff",
      kind: "rest",
      event_id: "event-1",
      rest: true,
    });
    expect(project.document.measures[0].events[0].notes).toEqual([]);
    expect(project.event_metadata["event-1"].rest).toBe("half rest");
  });

  it("报告过期映射并拒绝不存在或非法的映射变更", () => {
    const project = make_project();
    project.event_metadata["event-1"].pitch_name = "D4";

    expect(validate_notation_sync(project).map((issue) => issue.code))
      .toContain("notation_pitch_name_mismatch");
    expect(() => synchronize_notation_change(project, {
      origin: "staff",
      kind: "pitch",
      event_id: "missing",
      note_id: "note-1",
      midi: 60,
    })).toThrow("映射事件不存在");
    expect(() => synchronize_notation_change(project, {
      origin: "jianpu",
      kind: "signature",
      time_signature: "invalid",
    })).toThrow("拍号格式无效");
  });

  it("允许逐小节变拍号而不误报全曲拍号不一致", () => {
    const project = make_project();
    project.document.measures.push({
      id: "measure-2",
      number: "2",
      meter: { beats: 3, beat_unit: 4 },
      events: [],
    });

    expect(validate_notation_sync(project).map((issue) => issue.code))
      .not.toContain("notation_time_signature_mismatch");
  });

  it("按手别固定两个高音谱表，左手 G4 仍保留在第二谱表", () => {
    const project = make_project();
    const event = project.document.measures[0].events[0];
    event.hand = "left";
    event.notes[0].midi = 67;
    project.event_metadata["event-1"].hand = "left";
    project.event_metadata["event-1"].staff = 1;
    project.event_metadata["event-1"].clef = "bass";

    synchronize_project_notation_metadata(project);

    expect(project.event_metadata["event-1"].clef).toBe("treble");
    expect(project.event_metadata["event-1"].staff).toBe(2);
  });

  it("结束 Slur 时自动连接前方最近同手开始事件", () => {
    const project = make_project();
    project.document.measures[0].events = [{
      id: "right-start",
      onset_beats: 0,
      duration_beats: 1,
      hand: "right",
      voice: 1,
      notes: [{ id: "right-start-note", midi: 60, source_refs: [] }],
      source_refs: [],
    }, {
      id: "left-other",
      onset_beats: 0.5,
      duration_beats: 1,
      hand: "left",
      voice: 2,
      notes: [{ id: "left-other-note", midi: 48, source_refs: [] }],
      source_refs: [],
    }, {
      id: "right-middle",
      onset_beats: 1,
      duration_beats: 1,
      hand: "right",
      voice: 1,
      notes: [{ id: "right-middle-note", midi: 62, source_refs: [] }],
      source_refs: [],
    }, {
      id: "right-stop",
      onset_beats: 2,
      duration_beats: 1,
      hand: "right",
      voice: 2,
      notes: [{ id: "right-stop-note", midi: 64, source_refs: [] }],
      source_refs: [],
    }];
    synchronize_project_notation_metadata(project);

    apply_slur_marking(project, "right-start", "start");
    const result = apply_slur_marking(project, "right-stop", "stop");

    expect(result).toEqual({
      paired_start_event_id: "right-start",
      continued_event_ids: ["right-middle"],
    });
    expect(project.event_metadata["right-start"].slur).toBe("start");
    expect(project.event_metadata["right-middle"].slur).toBe("continue");
    expect(project.event_metadata["right-stop"].slur).toBe("stop");
    expect(project.event_metadata["left-other"].slur).toBe("none");
  });

  it("嵌套 Slur 结束时按同手栈后进先出配对", () => {
    const project = make_project();
    project.document.measures[0].events = [{
      id: "right-outer-start",
      onset_beats: 0,
      duration_beats: 1,
      hand: "right",
      voice: 1,
      notes: [{ id: "right-outer-start-note", midi: 60, source_refs: [] }],
      source_refs: [],
    }, {
      id: "right-inner-start",
      onset_beats: 1,
      duration_beats: 1,
      hand: "right",
      voice: 2,
      notes: [{ id: "right-inner-start-note", midi: 62, source_refs: [] }],
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
      notes: [{ id: "right-inner-stop-note", midi: 64, source_refs: [] }],
      source_refs: [],
    }, {
      id: "right-outer-stop",
      onset_beats: 3,
      duration_beats: 1,
      hand: "right",
      voice: 1,
      notes: [{ id: "right-outer-stop-note", midi: 65, source_refs: [] }],
      source_refs: [],
    }];
    synchronize_project_notation_metadata(project);

    apply_slur_marking(project, "right-outer-start", "start");
    apply_slur_marking(project, "right-inner-start", "start");
    project.event_metadata["left-stop"].slur = "stop";
    const inner_result = apply_slur_marking(project, "right-inner-stop", "stop");
    const outer_result = apply_slur_marking(project, "right-outer-stop", "stop");

    expect(inner_result.paired_start_event_id).toBe("right-inner-start");
    expect(outer_result.paired_start_event_id).toBe("right-outer-start");
    expect(project.event_metadata["left-stop"].slur).toBe("stop");
    expect(project.event_metadata["right-inner-start"].slur).toBe("start");
    expect(project.event_metadata["right-inner-stop"].slur).toBe("stop");
  });
});

function make_project() {
  const project = create_calibration_project();
  project.source.file_name = "fixture.json";
  project.document.measures = [{
    id: "measure-1",
    number: "1",
    meter: { beats: 4, beat_unit: 4 },
    events: [{
      id: "event-1",
      onset_beats: 0,
      duration_beats: 1,
      hand: "right",
      voice: 1,
      notes: [{
        id: "note-1",
        midi: 60,
        source_refs: [],
      }],
      source_refs: [],
    }],
  }];
  project.event_metadata["event-1"] = {
    event_id: "event-1",
    staff: 1,
    hand: "right",
    clef: "treble",
    articulation: "",
    dynamics: "mf",
    slur: "none",
    source_page: 1,
    source_system: 1,
  };
  return synchronize_project_notation_metadata(project);
}
