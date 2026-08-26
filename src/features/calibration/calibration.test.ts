import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parse_musicxml_to_score_document } from "./musicxml";
import {
  create_calibration_project,
  load_calibration_projects,
  remove_calibration_project,
  save_calibration_projects,
  upsert_calibration_project,
} from "./storage";
import { validate_calibration_project } from "./validation";

const work = {
  composer: "Ferdinand Beyer",
  opus: "Op.101",
  edition: "Test edition",
  publisher: "Test publisher",
  source: "Scan",
};

describe("通用乐谱校准领域", () => {
  it("按 MusicXML 时间轴保留 staff、voice、chord、tie、奏法和指法", () => {
    const imported = parse_musicxml_to_score_document(musicxml_fixture, work, {
      id: "beyer-golden",
      source_file: "beyer.musicxml",
    });
    const measure = imported.document.measures[0];
    const right = measure.events.filter((event) => event.hand === "right");
    const left = measure.events.filter((event) => event.hand === "left");

    expect(imported.document.title).toBe("Beyer Exercise 1");
    expect(imported.document.time_signature).toBe("4/4");
    expect(imported.document.key_signature).toBe("G major");
    expect(right).toHaveLength(3);
    expect(right[0]).toMatchObject({
      onset_beats: 0,
      duration_beats: 1,
      voice: 1,
      tie: "start",
    });
    expect(right[0].notes).toHaveLength(2);
    expect(right[0].notes[0]).toMatchObject({ midi: 67, finger: 1 });
    expect(right[0].notes[0].fingering).toMatchObject({
      source: "legacy",
      status: "needs_review",
      reason: "从 MusicXML technical/fingering 导入。",
      source_refs: [],
    });
    expect(left[0]).toMatchObject({
      onset_beats: 0,
      duration_beats: 4,
      hand: "left",
      voice: 2,
    });
    expect(imported.event_metadata[right[0].id]).toMatchObject({
      staff: 1,
      clef: "treble",
      articulation: "staccato",
      dynamics: "mf",
      slur: "start",
    });
    expect(imported.event_metadata[left[0].id]).toMatchObject({
      staff: 2,
      clef: "bass",
    });
    expect(imported.document.measures[1].events[0]).toMatchObject({
      onset_beats: 0,
      duration_beats: 1,
    });
    expect(imported.event_metadata[imported.document.measures[1].events[0].id].staff)
      .toBe(1);
  });

  it("分别报告符号、音乐结构和教学层问题", () => {
    const imported = parse_musicxml_to_score_document(musicxml_fixture, work, {
      id: "beyer-golden",
    });
    const project = create_calibration_project(work);
    project.source.file_name = "page-001.png";
    project.document = imported.document;
    project.event_metadata = imported.event_metadata;
    project.document.measures[0].events[1].duration_beats = 5;

    const result = validate_calibration_project(project);

    expect(result.by_level.L0.errors).toBe(0);
    expect(result.by_level.L1.errors).toBe(0);
    expect(result.by_level.L2.errors).toBeGreaterThan(0);
    expect(result.by_level.L3.warnings).toBeGreaterThan(0);
    expect(result.issues.map((issue) => issue.code)).toContain("measure_overflow");
    expect(result.issues.map((issue) => issue.code)).toContain("incomplete_fingering");
  });

  it("来源页与系统未关联属于追溯信息豁免项，不纳入质量检查", () => {
    const imported = parse_musicxml_to_score_document(musicxml_fixture, work, {
      id: "beyer-golden",
    });
    const project = create_calibration_project(work);
    project.source.file_name = "page-001.png";
    project.document = imported.document;
    project.event_metadata = Object.fromEntries(
      Object.entries(imported.event_metadata).map(([event_id, metadata]) => [
        event_id,
        {
          ...metadata,
          source_page: null,
          source_system: null,
        },
      ]),
    );

    const result = validate_calibration_project(project);

    expect(result.by_level.L0.errors).toBe(0);
    expect(result.issues.map((issue) => issue.code))
      .not.toContain("missing_source_mapping");
  });

  it("校准项目可在本地存储中增删并恢复", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const project = create_calibration_project(work);
    project.musicxml = "<score-partwise/>";
    const projects = upsert_calibration_project([], project);
    save_calibration_projects(projects, storage);

    expect(load_calibration_projects(storage)[0].work.opus).toBe("Op.101");
    expect(load_calibration_projects(storage)[0].musicxml).toBeNull();
    expect(remove_calibration_project(projects, project.id)).toEqual([]);
  });

  it("真实拜厄 MusicXML 在省略重复 attributes 时仍保持有限时间轴", () => {
    const xml = readFileSync(
      new URL(
        "../../../public/materials/beyer/拜厄钢琴基本教程_乐章_001.musicxml",
        import.meta.url,
      ),
      "utf8",
    );
    const imported = parse_musicxml_to_score_document(xml, work, {
      id: "beyer-real",
    });
    const events = imported.document.measures.flatMap((measure) => measure.events);

    expect(imported.document.measures.length).toBeGreaterThan(100);
    expect(events.length).toBeGreaterThan(100);
    expect(events.every((event) =>
      Number.isFinite(event.onset_beats) &&
      Number.isFinite(event.duration_beats))).toBe(true);
    expect(Object.values(imported.event_metadata).every((metadata) =>
      metadata.staff >= 1 &&
      metadata.clef !== "unknown")).toBe(true);
  });

  it("Audiveris 输出 divisions=0 时按音符类型回退为有限时值", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>0</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
              <clef><sign>G</sign><line>2</line></clef>
            </attributes>
            <note>
              <pitch><step>G</step><octave>4</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>whole</type>
            </note>
          </measure>
        </part>
      </score-partwise>`;
    const imported = parse_musicxml_to_score_document(xml, work, {
      id: "beyer-divisions-zero",
    });
    const events = imported.document.measures.flatMap((measure) =>
      measure.events);

    expect(events).toHaveLength(1);
    expect(events.every((event) =>
      Number.isFinite(event.duration_beats))).toBe(true);
    expect(events.every((event) => event.duration_beats === 4)).toBe(true);
  });
});

const musicxml_fixture = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Beyer Exercise 1</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><staff>1</staff>
        <tie type="start"/>
        <notations>
          <technical><fingering>1</fingering></technical>
          <articulations><staccato/></articulations>
          <slur type="start"/>
        </notations>
      </note>
      <note>
        <chord/>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><staff>1</staff>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><staff>1</staff>
      </note>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><staff>1</staff>
      </note>
      <backup><duration>16</duration></backup>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>16</duration><voice>2</voice><staff>2</staff>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <clef number="1"><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>4</duration><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;
