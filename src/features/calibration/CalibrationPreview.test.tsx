import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CalibrationPreview } from "./CalibrationPreview";
import type { calibration_event_metadata } from "./types";
import type { score_document } from "@/features/score";

describe("CalibrationPreview", () => {
  it("预览整首乐谱而不是只裁剪当前小节", () => {
    const markup = renderToStaticMarkup(
      <CalibrationPreview
        document={document_fixture}
        mode="data"
        selected_measure_id="measure-1"
      />,
    );

    expect(markup).toContain("measure-1");
    expect(markup).toContain("measure-2");
    expect(markup).toContain("ScoreDocument JSON");
    expect(markup).toContain("应用 JSON");
    expect(markup).toContain("textarea");
  });

  it(
    "简谱视图共享事件选择与校准标记",
    () => {
      const markup = renderToStaticMarkup(
        <CalibrationPreview
          document={document_with_event}
          event_metadata={event_metadata}
          mode="jianpu"
          selected_event_id="event-1"
          on_event_select={() => undefined}
        />,
      );

      expect(markup).toContain('data-event-id="event-1"');
      expect(markup).toContain("is-current");
      expect(markup).toContain('role="button"');
      expect(markup).toContain('data-dynamics="mf"');
      expect(markup).toContain('data-articulation="staccato"');
      expect(markup).toContain('data-slur="start"');
      expect(markup).toContain(">mf</text>");
    },
  );

  it(
    "五线谱视图使用标准 MusicXML 渲染入口",
    () => {
      const markup = renderToStaticMarkup(
        <CalibrationPreview
          document={document_with_event}
          event_metadata={event_metadata}
          mode="staff"
          selected_event_id="event-1"
          on_event_select={() => undefined}
        />,
      );

      expect(markup).toContain('data-standard-staff-renderer="osmd"');
      expect(markup).toContain('data-current-event-id="event-1"');
      expect(markup).toContain('class="calibration-standard-staff-host"');
    },
  );
});

const document_fixture: score_document = {
  schema_version: 2,
  id: "preview-fixture",
  number: "1",
  title: "整曲预览样本",
  key_signature: "C major",
  tonic_midi: 60,
  time_signature: "4/4",
  status: "needs_review",
  provenance: {
    kind: "manual",
    source_id: "fixture",
    source_file: "fixture.json",
    source_sha256: null,
    font_config_version: null,
    importer_version: "test",
    references: [],
  },
  lyrics: [],
  hand_positions: [],
  measures: [
    {
      id: "measure-1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [],
    },
    {
      id: "measure-2",
      number: "2",
      meter: { beats: 4, beat_unit: 4 },
      events: [],
    },
  ],
  review: {
    reviewed_by: null,
    reviewed_at: null,
    published_by: null,
    published_at: null,
    note: "",
  },
};

const document_with_event: score_document = {
  ...document_fixture,
  measures: [{
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
  }],
};

const event_metadata: Record<string, calibration_event_metadata> = {
  "event-1": {
    event_id: "event-1",
    staff: 1,
    hand: "right",
    clef: "treble",
    articulation: "staccato",
    dynamics: "mf",
    slur: "start",
    source_page: 1,
    source_system: 1,
  },
};
