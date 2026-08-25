import { afterEach, describe, expect, it, vi } from "vitest";

import type { lesson } from "@/features/course/types";
import { clear_material_asset_cache } from "./loadCatalog";
import { resolve_textbook_lesson } from "./resolveTextbookLesson";

const textbook_lesson: lesson = {
  id: "w1-d1-beyer",
  course_id: "keyboard-foundation",
  week_number: 1,
  day_index: 1,
  title: "拜厄 PDF 第 7 页 · 触键练习",
  description: "测试教材课",
  guidance: "测试",
  objective: "测试",
  hand_mode: "both",
  target_bpm: 48,
  estimated_minutes: 15,
  material_kind: "beyer",
  exercise_type: "method",
  practice_mode: "guided_input",
  source_ref: "测试",
  score: {
    id: "score",
    title: "拜厄 PDF 第 7 页",
    key_signature: "C 大调（1 = C）",
    jianpu_tonic_midi: 60,
    time_signature: "4/4",
    beats_per_measure: 4,
    tempo_hint: "48 BPM",
    start_position: "中央 C",
    finger_hint: "测试",
    finger_guide: {
      preparation: ["测试准备"],
      actions: ["测试动作"],
      success_checks: ["测试标准"],
      common_mistakes: ["测试纠错"],
      position_strategy: ["测试手位判断"],
      fingering_rules: ["测试指法依据"],
      self_check: ["测试自查"],
      position_map: [],
    },
    source: {
      kind: "musicxml",
      status: "published",
      label: "测试教材",
      asset_id: "beyer.segment.001",
      measure_start: 2,
      measure_end: 3,
    },
    steps: [],
  },
};

const catalog = {
  schema_version: "1.0",
  generated_at: "2026-07-18",
  review_only: false,
  notice: "formal",
  materials: [{
    id: "beyer",
    title: "拜厄钢琴基本教程",
    page_count: 102,
    segment_count: 1,
    segments: [{
      id: "beyer.segment.001",
      material_id: "beyer",
      sequence: 1,
      title: "拜厄",
      source_pages: [7],
      source_page_label: "PDF 第 7 页",
      ocr_labels: [],
      ocr_exercise_numbers: [],
      xml_version: "4.0.3",
      part_count: 1,
      measure_count: 3,
      time_signatures: ["4/4"],
      musicxml_url: "/materials/beyer/example.musicxml",
      sha256: "source-hash",
      source_status: "candidate",
      status: "published",
      realtime_judgement_allowed: true,
      mapping_confidence: "source_page",
      derived_assets: {
        source_sha256: "source-hash",
        practice_events_url: "/materials/beyer/example.practice.json",
      },
    }],
  }],
};

const practice_events = {
  schema_version: "1.0",
  asset_id: "beyer.segment.001",
  source_sha256: "source-hash",
  events: [
    { id: "event-1", measure_index: 1, measure_number: "1", onset_beats: 0, duration_beats: 1, notes: [60], note_names: ["C4"], notation: "第 1 小节", hand: "right", match_mode: "single_note" },
    { id: "event-2", measure_index: 2, measure_number: "2", onset_beats: 0, duration_beats: 1, notes: [62], note_names: ["D4"], notation: "第 2 小节", hand: "right", match_mode: "single_note" },
    { id: "event-3", measure_index: 3, measure_number: "3", onset_beats: 0, duration_beats: 1, notes: [48, 64], note_names: ["C3", "E4"], notation: "第 3 小节", hand: "both", match_mode: "chord" },
  ],
};

afterEach(() => {
  clear_material_asset_cache();
  vi.unstubAllGlobals();
});

describe("教材课判定解析", () => {
  it("只加载课程指定小节，并将真实 MusicXML 事件变成引导判定步骤", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.endsWith("catalog.json") ? catalog : practice_events),
    })));

    const resolved = await resolve_textbook_lesson(textbook_lesson);

    expect(resolved.practice_mode).toBe("guided_input");
    expect(resolved.steps).toHaveLength(2);
    expect(resolved.steps?.map((step) => step.notes)).toEqual([[62], [48, 64]]);
    expect(resolved.steps?.[0].fingerings).toEqual([{
      note: 62,
      finger: 2,
      hand: "right",
      source: "generated",
    }]);
    expect(resolved.steps?.[1].fingerings?.map((fingering) => fingering.finger)).toEqual([5, 3]);
    expect(resolved.steps?.map((step) => step.hand)).toEqual(["right", "both"]);
    expect(resolved.hand_mode).toBe("both");
    expect(resolved.score.source.musicxml_url).toBe("/materials/beyer/example.musicxml");
    expect(resolved.score.source.measure_start).toBe(2);
    expect(resolved.score.source.measure_end).toBe(3);
    expect(resolved.score.source.label).toBe("测试教材 · 已接入跟弹提示");
  });

  it("拒绝教材事件哈希不匹配", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(
        url.endsWith("catalog.json")
          ? catalog
          : { ...practice_events, source_sha256: "different-hash" },
      ),
    })));

    await expect(resolve_textbook_lesson(textbook_lesson)).rejects.toThrow("本次教材原谱已更新");
  });

  it("按来源页合并全部教材片段，并把判定小节连续编号", async () => {
    const multi_catalog = {
      ...catalog,
      materials: [{
        ...catalog.materials[0],
        segment_count: 2,
        segments: [
          catalog.materials[0].segments[0],
          {
            ...catalog.materials[0].segments[0],
            id: "beyer.segment.002",
            sequence: 2,
            title: "拜厄第二段",
            musicxml_url: "/materials/beyer/second.musicxml",
            sha256: "second-hash",
            derived_assets: {
              source_sha256: "second-hash",
              practice_events_url: "/materials/beyer/second.practice.json",
            },
          },
        ],
      }],
    };
    const first_events = {
      ...practice_events,
      events: practice_events.events.filter((event) => event.measure_index <= 2),
    };
    const second_events = {
      ...practice_events,
      asset_id: "beyer.segment.002",
      source_sha256: "second-hash",
      events: [
        {
          id: "second-event-1",
          measure_index: 1,
          measure_number: "1",
          onset_beats: 0,
          duration_beats: 1,
          notes: [65],
          note_names: ["F4"],
          notation: "第二段第 1 小节",
          hand: "right",
          match_mode: "single_note",
        },
      ],
    };
    const multi_lesson: lesson = {
      ...textbook_lesson,
      hand_mode: "right",
      score: {
        ...textbook_lesson.score,
        source: {
          kind: "musicxml",
          status: "published",
          label: "完整教材页",
          asset_id: "beyer.segment.001",
          source_page: 7,
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => {
        if (url.endsWith("catalog.json")) {
          return Promise.resolve(multi_catalog);
        }
        return Promise.resolve(url.includes("second") ? second_events : first_events);
      },
    })));

    const resolved = await resolve_textbook_lesson(multi_lesson);

    expect(resolved.steps?.map((step) => step.notes)).toEqual([[60], [62], [65]]);
    expect(resolved.steps?.map((step) => step.measure_index)).toEqual([1, 2, 3]);
    expect(resolved.score.source.excerpts).toHaveLength(2);
    expect(resolved.score.source.excerpts?.map((excerpt) => excerpt.musicxml_url)).toEqual([
      "/materials/beyer/example.musicxml",
      "/materials/beyer/second.musicxml",
    ]);
  });

  it("审核专用目录不能进入正式跟弹", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...catalog, review_only: true }),
    })));

    await expect(resolve_textbook_lesson(textbook_lesson)).rejects.toThrow("仅供核对");
  });

  it("本地标记为不可使用的教材不能继续跟弹", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => key === "lianqinbu.material-review-gates.v1"
          ? JSON.stringify({
              schema_version: 1,
              records: {
                "beyer.segment.001": {
                  segment_id: "beyer.segment.001",
                  content_sha256: "source-hash",
                  status: "rejected",
                  checks: {
                    structure_checked: true,
                    music_semantics_checked: true,
                    visual_pdf_checked: true,
                    source_mapping_checked: true,
                  },
                  note: "不可使用",
                  updated_at: "2026-07-18T00:00:00.000Z",
                  history: [],
                },
              },
            })
          : null,
      },
    });
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.endsWith("catalog.json") ? catalog : practice_events),
    })));

    await expect(resolve_textbook_lesson(textbook_lesson)).rejects.toThrow("仍在核对中");
  });

  it("课程摘录起始位置变化时拒绝静默回退", async () => {
    const shifted_lesson: lesson = {
      ...textbook_lesson,
      score: {
        ...textbook_lesson.score,
        source: {
          ...textbook_lesson.score.source,
          measure_start: 99,
          measure_end: 100,
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.endsWith("catalog.json") ? catalog : practice_events),
    })));

    await expect(resolve_textbook_lesson(shifted_lesson)).rejects.toThrow("起始位置已变化");
  });
});
