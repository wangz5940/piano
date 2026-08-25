import { describe, expect, it } from "vitest";

import type { score_document } from "@/features/score";

import {
  parse_score_document_json,
  validate_score_document_shape,
} from "./scoreDocumentJson";

describe("ScoreDocument JSON 校准编辑", () => {
  it("解析并校验可覆盖的 ScoreDocument JSON", () => {
    const parsed = parse_score_document_json(
      JSON.stringify(score_document_fixture),
    );

    expect(parsed.schema_version).toBe(2);
    expect(parsed.measures[0].events[0].notes[0].midi).toBe(60);
  });

  it("接受校准台发布的指法说明状态", () => {
    const document: score_document = structuredClone(score_document_fixture);
    document.status = "published";
    document.measures[0].events[0].notes[0] = {
      ...document.measures[0].events[0].notes[0],
      finger: 1,
      fingering: {
        source: "manual",
        status: "published",
        reason: "校准台当前事件面板设置指法。",
        confirmed_by: null,
        confirmed_at: null,
        source_refs: [],
      },
    };

    expect(() => validate_score_document_shape(document)).not.toThrow();
  });

  it("把旧 v1 JSON 迁移为 v2 后再覆盖", () => {
    const parsed = parse_score_document_json(JSON.stringify({
      schema_version: 1,
      id: "legacy-score",
      title: "Legacy",
      key_signature: "C major",
      tonic_midi: 60,
      time_signature: "4/4",
      measures: [{
        id: "measure-1",
        number: "1",
        meter: { beats: 4, beat_unit: 4 },
        events: [],
      }],
    }));

    expect(parsed.schema_version).toBe(2);
    expect(parsed.provenance.kind).toBe("legacy");
  });

  it("报告 JSON 语法和乐谱结构错误", () => {
    expect(() => parse_score_document_json("{")).toThrow("JSON 格式无效");
    expect(() => validate_score_document_shape({
      ...score_document_fixture,
      measures: [],
    })).toThrow("乐谱至少需要一个小节");
    expect(() => validate_score_document_shape({
      ...score_document_fixture,
      measures: [{
        ...score_document_fixture.measures[0],
        events: [{
          ...score_document_fixture.measures[0].events[0],
          notes: [{
            ...score_document_fixture.measures[0].events[0].notes[0],
            midi: 12,
          }],
        }],
      }],
    })).toThrow("音高");
    expect(() => validate_score_document_shape({
      ...score_document_fixture,
      measures: [{
        ...score_document_fixture.measures[0],
        events: [{
          ...score_document_fixture.measures[0].events[0],
          notes: [{
            ...score_document_fixture.measures[0].events[0].notes[0],
            finger: 1,
          }],
        }],
      }],
    })).toThrow("v2 指法必须包含来源、状态和依据");
  });
});

const score_document_fixture: score_document = {
  schema_version: 2,
  id: "json-score",
  number: "1",
  title: "JSON Score",
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
  review: {
    reviewed_by: null,
    reviewed_at: null,
    published_by: null,
    published_at: null,
    note: "",
  },
};
