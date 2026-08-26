import { describe, expect, it, vi } from "vitest";

import type { score_document } from "@/features/score";

import { score_document_to_musicxml } from "./scoreDocumentMusicXml";

describe("score_document_to_musicxml", () => {
  it("导出标准五线谱渲染所需的核心 MusicXML 元素", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00Z"));
    const document: score_document = {
      schema_version: 2,
      id: "score-fixture",
      number: "1",
      title: "标准五线谱样本",
      key_signature: "G major",
      tonic_midi: 67,
      time_signature: "4/4",
      status: "published",
      provenance: {
        kind: "manual",
        source_id: "fixture",
        source_file: null,
        source_sha256: null,
        font_config_version: null,
        importer_version: "test",
        references: [],
      },
      lyrics: [],
      hand_positions: [],
      measures: [{
        id: "m1",
        number: "1",
        meter: { beats: 4, beat_unit: 4 },
        events: [{
          id: "right-start",
          onset_beats: 0,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          tie: "start",
          notes: [{
            id: "right-start-note",
            midi: 67,
            finger: 1,
            source_refs: [],
          }],
          source_refs: [],
        }, {
          id: "right-stop",
          onset_beats: 1,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          tie: "continue",
          notes: [{
            id: "right-stop-note",
            midi: 67,
            source_refs: [],
          }],
          source_refs: [],
        }, {
          id: "right-tie-stop",
          onset_beats: 2,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          tie: "stop",
          notes: [{
            id: "right-tie-stop-note",
            midi: 67,
            source_refs: [],
          }],
          source_refs: [],
        }, {
          id: "left-rest",
          onset_beats: 0,
          duration_beats: 4,
          hand: "left",
          voice: 2,
          notes: [],
          source_refs: [],
        }],
      }, {
        id: "m2",
        number: "2",
        meter: { beats: 3, beat_unit: 4 },
        key_signature: "F major",
        tonic_midi: 65,
        events: [],
      }],
      review: {
        reviewed_by: null,
        reviewed_at: null,
        published_by: null,
        published_at: null,
        note: null,
      },
    };

    const xml = score_document_to_musicxml(document, {
      "right-start": {
        staff: 1,
        clef: "treble",
        dynamics: "mf",
        articulation: "staccato",
        slur: "start",
        fermata: "upright",
        ornament: "trill-mark",
        wedge: "crescendo",
        pedal: "start",
        words: "dolce",
      },
      "right-stop": {
        staff: 1,
        clef: "treble",
        slur: "stop",
      },
      "left-rest": {
        staff: 1,
        clef: "bass",
        slur: "none",
      },
    });

    expect(xml).toContain("<encoding-date>2026-08-25</encoding-date>");
    expect(xml).toContain("<fifths>1</fifths>");
    expect(xml).toContain("<time>");
    expect(xml).toContain("<staves>2</staves>");
    expect(xml).toContain('<clef number="1">\n          <sign>G</sign>\n          <line>2</line>\n        </clef>');
    expect(xml).toContain('<clef number="2">\n          <sign>G</sign>\n          <line>2</line>\n        </clef>');
    expect(xml).toContain("<rest/>");
    expect(xml).toContain("<backup>");
    expect(xml).toContain("<staff>2</staff>");
    expect(xml).not.toContain("<sign>F</sign>");
    expect(xml).toContain("<fingering>1</fingering>");
    expect(xml).toContain("<mf/>");
    expect(xml).toContain("<staccato/>");
    expect(xml).toContain('<fermata type="upright"/>');
    expect(xml).toContain("<trill-mark/>");
    expect(xml).toContain('<wedge type="crescendo"/>');
    expect(xml).toContain('<pedal type="start"/>');
    expect(xml).toContain("<words>dolce</words>");
    expect(xml).toContain("<fifths>-1</fifths>");
    expect(xml).toContain("<beats>3</beats>");
    expect(xml.match(/<tie type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tie type="stop"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tied type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tied type="stop"\/>/g)).toHaveLength(2);
    expect(xml).not.toContain('type="continue"');
    expect(xml).toContain('<slur type="start" number="1"/>');
    expect(xml).toContain('<slur type="stop" number="1"/>');
    vi.useRealTimers();
  });

  it("按手别栈为嵌套 Slur 输出稳定编号", () => {
    const document: score_document = {
      schema_version: 2,
      id: "nested-slur-fixture",
      number: "2",
      title: "嵌套连线样本",
      key_signature: "C major",
      tonic_midi: 60,
      time_signature: "4/4",
      status: "published",
      provenance: {
        kind: "manual",
        source_id: "fixture",
        source_file: null,
        source_sha256: null,
        font_config_version: null,
        importer_version: "test",
        references: [],
      },
      lyrics: [],
      hand_positions: [],
      measures: [{
        id: "m1",
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
      }],
      review: {
        reviewed_by: null,
        reviewed_at: null,
        published_by: null,
        published_at: null,
        note: null,
      },
    };

    const xml = score_document_to_musicxml(document, {
      "right-outer-start": { slur: "start" },
      "right-inner-start": { slur: "start" },
      "left-stop": { slur: "stop" },
      "right-inner-stop": { slur: "stop" },
      "right-outer-stop": { slur: "stop" },
    });

    expect(xml).toContain('<slur type="start" number="1"/>');
    expect(xml).toContain('<slur type="start" number="2"/>');
    expect(xml).toContain('<slur type="stop" number="2"/>');
    expect(xml).toContain('<slur type="stop" number="1"/>');
    expect(xml).not.toContain('<slur type="stop" number="3"/>');
  });

  it("同时打开的左右手 Slur 使用不同 MusicXML 编号", () => {
    const document: score_document = {
      schema_version: 2,
      id: "parallel-hand-slur-fixture",
      number: "3",
      title: "双手连线样本",
      key_signature: "C major",
      tonic_midi: 60,
      time_signature: "4/4",
      status: "published",
      provenance: {
        kind: "manual",
        source_id: "fixture",
        source_file: null,
        source_sha256: null,
        font_config_version: null,
        importer_version: "test",
        references: [],
      },
      lyrics: [],
      hand_positions: [],
      measures: [{
        id: "m1",
        number: "1",
        meter: { beats: 4, beat_unit: 4 },
        events: [{
          id: "right-start",
          onset_beats: 0,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{ id: "right-start-note", midi: 72, source_refs: [] }],
          source_refs: [],
        }, {
          id: "left-start",
          onset_beats: 0,
          duration_beats: 2,
          hand: "left",
          voice: 2,
          notes: [{ id: "left-start-note", midi: 48, source_refs: [] }],
          source_refs: [],
        }, {
          id: "left-stop",
          onset_beats: 2,
          duration_beats: 2,
          hand: "left",
          voice: 2,
          notes: [{ id: "left-stop-note", midi: 52, source_refs: [] }],
          source_refs: [],
        }, {
          id: "right-stop",
          onset_beats: 3,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{ id: "right-stop-note", midi: 74, source_refs: [] }],
          source_refs: [],
        }],
      }],
      review: {
        reviewed_by: null,
        reviewed_at: null,
        published_by: null,
        published_at: null,
        note: null,
      },
    };

    const xml = score_document_to_musicxml(document, {
      "right-start": { slur: "start" },
      "left-start": { slur: "start" },
      "left-stop": { slur: "stop" },
      "right-stop": { slur: "stop" },
    });

    const slur_tags = xml.match(/<slur[^>]+\/>/g);
    expect(slur_tags).toContain('<slur type="start" number="1"/>');
    expect(slur_tags).toContain('<slur type="start" number="2"/>');
    expect(slur_tags).toContain('<slur type="stop" number="1"/>');
    expect(slur_tags).toContain('<slur type="stop" number="2"/>');
  });
});
