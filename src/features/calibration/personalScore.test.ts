import { describe, expect, it } from "vitest";
import { create_calibration_project, load_calibration_projects, save_calibration_projects } from "./storage";
import { personal_jianpu_score } from "./personalScore";

describe("个人校对", () => {
  it("按账号隔离本地草稿，访客和另一账号读不到", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const project = create_calibration_project();
    save_calibration_projects([project], storage, "alice");
    expect(load_calibration_projects(storage, "alice")).toHaveLength(1);
    expect(load_calibration_projects(storage, "bob")).toHaveLength(0);
    expect(load_calibration_projects(storage)).toHaveLength(0);
    save_calibration_projects([], storage, "alice");
    expect(load_calibration_projects(storage, "alice")).toHaveLength(0);
  });
  it("个人预览保留左右手音高、指法、休止与小节节拍", () => {
    const project = create_calibration_project();
    project.document.measures = [{
      id: "m1", number: "1", meter: { beats: 3, beat_unit: 4 },
      events: [
        { id: "e1", hand: "right", onset_beats: 0, duration_beats: 3, voice: 1,
          notes: [{ id: "n1", midi: 67, finger: 3, source_refs: [] }], source_refs: [] },
        { id: "e2", hand: "left", onset_beats: 0, duration_beats: 3, voice: 2,
          notes: [], source_refs: [] },
      ],
    }];
    const score = personal_jianpu_score(project, "test");
    expect(score.measures[0].meter).toEqual({ beats: 3, beat_unit: 4 });
    expect(score.measures[0].events[0]).toMatchObject({
      right_notes: [67], left_rest: true, right_fingerings: [{ note: 67, finger: 3, source: "manual" }],
    });
  });
});
