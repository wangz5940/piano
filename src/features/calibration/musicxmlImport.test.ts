import { describe, expect, it } from "vitest";
import { normalize_musicxml_divisions, parse_musicxml_to_score_document } from "./musicxml";

const work = { composer: "", opus: "", edition: "", publisher: "", source: "" };
const note = (step: string, extra = "", duration = 1) =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration>${extra}</note>`;
const score = (parts: string) => `<score-partwise><part-list/>${parts}</score-partwise>`;
const parse = (xml: string) => parse_musicxml_to_score_document(xml, work, { id: "test" });

describe("教材识谱的时间轴与谱表恢复", () => {
  it("忽略隐藏占位谱表，后续钢琴声部仍按局部staff分左右手", () => {
    const imported = parse(score(`
      <part id="P1"><measure number="1"><attributes>
        <divisions>1</divisions><staff-details print-object="no"/>
      </attributes><note><rest measure="yes"/><duration>32</duration></note></measure></part>
      <part id="P2"><measure number="1"><attributes>
        <divisions>1</divisions><staves>2</staves>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <key><fifths>-1</fifths></key>
      </attributes>${note("C", "<staff>1</staff>", 3)}
      <backup><duration>3</duration></backup>
      ${note("F", "<staff>2</staff>", 3)}</measure></part>`));
    expect(imported.document.time_signature).toBe("3/4");
    expect(imported.document.key_signature).toBe("F major");
    expect(imported.document.measures[0].events.map((event) =>
      [event.hand, event.onset_beats, event.duration_beats, event.notes[0].midi]))
      .toEqual([["right", 0, 3, 60], ["left", 0, 3, 65]]);
  });

  it("恢复小于1的divisions，同时恢复附点时值、backup和整小节休止", () => {
    const xml = score(`<part id="P1"><measure number="1"><attributes>
      <divisions>0</divisions><staves>2</staves>
      <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>${note("C", "<type>half</type><dot/><staff>1</staff>", 1.5)}
      <backup><duration>1.5</duration></backup>
      <note><rest measure="yes"/><duration>1.5</duration><staff>2</staff></note>
      </measure></part>`);
    const before = parse(xml).document;
    expect(before.measures[0].events.map((event) =>
      [event.onset_beats, event.duration_beats])).toEqual([[0, 3], [0, 3]]);
    const normalized = normalize_musicxml_divisions(xml);
    expect(normalized.repaired_measures).toBe(1);
    expect(normalized.xml).toContain("<divisions>960</divisions>");
    expect(parse(normalized.xml).document).toEqual(before);
  });

  it("按小节号与重复次数对齐缺少前导小节的声部，保留原页码", () => {
    const imported = parse(score(`
      <part id="P1"><measure number="3"><print new-page="yes"/>
      <attributes><clef><sign>F</sign><line>4</line></clef></attributes>
      ${note("G")}</measure></part>
      <part id="P2"><measure number="1">${note("C")}</measure>
      <measure number="2">${note("D")}</measure><measure number="2">${note("E")}</measure>
      <measure number="3"><print new-page="yes"/>${note("F")}</measure></part>`));
    expect(imported.document.measures.map((measure) => measure.number))
      .toEqual(["1", "2", "2", "3"]);
    const last = imported.document.measures[3];
    expect(last.events.map((event) => event.notes[0].midi).sort()).toEqual([65, 67]);
    expect(new Set(last.events.map((event) => event.voice)).size).toBe(2);
    expect(last.events.every((event) => imported.event_metadata[event.id].source_page === 2)).toBe(true);
    expect(last.events.find((event) => event.notes[0].midi === 67)?.hand).toBe("left");
  });

  it("同一个音符的延音线终止与起始合并为continue", () => {
    const imported = parse(score(`<part id="P1"><measure number="1">
      ${note("C", '<tie type="stop"/><tie type="start"/>')}
      </measure></part>`));
    expect(imported.document.measures[0].events[0].tie).toBe("continue");
  });

  it("单谱表左手标注优先于高音谱号", () => {
    const xml = `<score-partwise><part-list>
      <score-part id="P1"><part-name>Left hand</part-name></score-part>
      </part-list><part id="P1"><measure number="1">${note("G")}</measure></part></score-partwise>`;
    expect(parse(xml).document.measures[0].events[0].hand).toBe("left");
  });

  it("恢复继承的divisions时先声明时间刻度，再保留小节末的换谱号", () => {
    const xml = score(`<part id="P1">
      <measure number="1"><attributes><divisions>0</divisions></attributes>
      ${note("C", "<type>whole</type>", 2)}</measure>
      <measure number="2">${note("D", "<type>whole</type>", 2)}
      <attributes><clef><sign>F</sign><line>4</line></clef></attributes>
      </measure></part>`);
    const normalized = normalize_musicxml_divisions(xml);
    const second = normalized.xml.slice(normalized.xml.indexOf('<measure number="2"'));
    expect(second.indexOf("<divisions>960")).toBeLessThan(second.indexOf("<note>"));
    expect(second.indexOf("<clef>")).toBeGreaterThan(second.indexOf("</note>"));
    expect(parse(normalized.xml).document.measures[1].events[0].duration_beats).toBe(4);
  });
});
