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
    expect(xml.match(/<tie type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tie type="stop"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tied type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tied type="stop"\/>/g)).toHaveLength(2);
    expect(xml).not.toContain('type="continue"');
    expect(xml).toContain('<slur type="start"/>');
    expect(xml).toContain('<slur type="stop"/>');
    vi.useRealTimers();
  });
});
