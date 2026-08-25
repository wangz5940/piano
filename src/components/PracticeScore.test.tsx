import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { practice_score } from "@/features/course/types";
import { get_lesson } from "@/features/course/data";
import type {
  score_annotation,
  score_document_v2,
  score_hand_position_movement,
} from "@/features/score";
import {
  StaffAidRenderer,
  to_render_score_from_score_document,
} from "@/features/jianpu/render";
import { imported_teaching_entries, repertoire_entries } from "@/features/repertoire/data";
import { PracticeScore } from "./PracticeScore";
import { parse_time_signature } from "./scoreTimeSignature";

type practice_score_with_score_document = practice_score & {
  score_document: score_document_v2;
};

describe("练习谱组件", () => {
  it("保留 6/8 拍号的分母", () => {
    expect(parse_time_signature("6/8", 6)).toEqual([6, 8]);
  });

  it("为完整四小节视奏课展示可直接阅读的谱面和手位提示", () => {
    const lesson = get_lesson("w1-d1-sight");
    if (!lesson) {
      throw new Error("Expected w1-d1-sight lesson");
    }

    const markup = renderToStaticMarkup(<PracticeScore score={lesson.score} />);

    expect(markup).toContain("完整 4 小节视奏谱");
    expect(markup).toContain("C 大调（1 = C）");
    expect(markup).toContain("4/4");
    expect(markup).toContain(">简谱<");
    expect(markup).toContain(">五线谱<");
    expect(markup).toContain("收起谱面");
    expect(markup).toContain("右手谱");
    expect(markup).toContain('data-measure-index="0"');
    expect(markup).toContain("起始手位");
    expect(markup).toContain("指法提示");
    expect(markup).toContain("本课手位、指法与和弦分析");
    expect(markup).toContain("根据当前谱面解释为什么这样弹");
    expect(markup).toContain("本课先判断什么");
    expect(markup).toContain("手位为什么这样放");
    expect(markup).toContain("逐音指法为什么这样");
    expect(markup).toContain("左手和弦为什么这样");
    expect(markup).toContain("C4 Position");
    expect(markup).toContain("D4 Position");
    expect(markup).toContain("Return to C4 Position");
    expect(markup).toContain("C4 · D4 · E4 · F4 · G4");
    expect(markup).toContain("手指：1 2 3 4 5");
    expect(markup).toContain("C 大调（1 = C） 表示 1 对应 C4");
    expect(markup).toContain("第 1 小节第 1 拍：E4 用右手 3 指");
    expect(markup).toContain("E4 在 C4 Position 中是第 3 个音，所以自然对应 3 指");
    expect(markup).toContain("当前谱面以右手旋律为主，左手先预备 C → G → Am → F");
    expect(markup).not.toContain("原谱指法说明");
    expect(markup).not.toContain("第一次学指法：一步一步这样弹");
    expect(markup).toContain("jianpu-svg-fingering");
    expect(markup).toContain('data-fingering="1"');
    expect(markup).toContain("jianpu-svg-degree");
    expect(markup).not.toContain('data-hand="left"');
    expect(markup).not.toContain("就近指法");
  });

  it("为待审核小汤教材课显示课程内预备谱和指法候选边界", () => {
    const lesson = get_lesson("w1-d1-method");
    if (!lesson) {
      throw new Error("Expected w1-d1-method lesson");
    }

    const markup = renderToStaticMarkup(<PracticeScore score={lesson.score} />);

    expect(markup).toContain("小汤 1");
    expect(markup).toContain("配套预备谱");
    expect(markup).toContain("待人工核对");
    expect(markup).toContain("jianpu-svg-fingering");
    expect(markup).toContain('data-fingering="1"');
    expect(markup).toContain("本课手位、指法与和弦分析");
    expect(markup).toContain("第 1 小节第 1 拍");
    expect(markup).not.toContain("候选指法");
    expect(markup).not.toContain("OCR 指法候选只能辅助核对");
    expect(markup).not.toContain("未人工确认前不得作为判定标准");
    expect(markup).not.toContain("第一次学指法：一步一步这样弹");
    expect(markup).not.toContain("怎样才算弹对");
    expect(markup).not.toContain("出现这些问题这样改");
    expect(markup).not.toContain("教材原谱");
    expect(markup).not.toContain("打开教材对照谱");
  });

  it("为《小星星》展示源简谱对照图", () => {
    const lesson = get_lesson("w2-d3-repertoire");
    if (!lesson) {
      throw new Error("Expected w2-d3-repertoire lesson");
    }

    const markup = renderToStaticMarkup(<PracticeScore score={lesson.score} />);

    expect(markup).not.toContain("源简谱对照");
    expect(markup).toContain("双手谱");
    expect(markup).toContain('data-hand="left"');
    expect(markup).toContain("课程重新编配左手伴奏");
  });

  it("为授权整理版保留双手分配并移除源简谱对照", () => {
    const score = imported_teaching_entries
      .find((entry) => entry.title.includes("KD Searching"))?.score;
    if (!score) {
      throw new Error("Expected imported teaching score");
    }

    const markup = renderToStaticMarkup(<PracticeScore score={score} />);

    expect(markup).toContain("《KD Searching》 · 整首导入整理版");
    expect(markup).not.toContain("源简谱对照");
    expect(markup).toContain("双手谱");
    expect(markup).toContain('data-hand="right"');
    expect(markup).toContain('data-hand="left"');
    expect(markup).toContain('data-jianpu-brace="true"');
    expect(markup).toContain("jianpu-svg-duration-lines");
    expect(markup).toContain('data-jianpu-sustain="true"');
    expect(markup).not.toContain("textbook-jianpu-event");
    expect(markup).toContain("根据原始 CCMZ 数据完整整理");
  });

  it("把简谱临时升号显示为左上角标记", () => {
    const score = repertoire_entries.find((entry) => entry.id === "fur-elise-theme")?.score;
    if (!score) {
      throw new Error("Expected fur elise repertoire score");
    }

    const markup = renderToStaticMarkup(<PracticeScore score={score} />);

    expect(markup).toContain("jianpu-svg-accidental");
    expect(markup).toContain('data-jianpu-accidental="#"');
  });

  it("practice_score 携带 score_document 时优先使用 v2 简谱渲染", () => {
    const markup = renderToStaticMarkup(
      <PracticeScore score={make_practice_score_with_score_document()} />,
    );

    expect(markup).toContain("Position: C4 Position");
    expect(markup).toContain("Move to D4 Position");
    expect(markup).toContain("Return to C4 Position");
    expect(markup).toContain("主爱引领");
    expect(markup).toContain("向前跨步");
    expect(markup).toContain("安稳归回");
    expect(markup).toContain('class="jianpu-svg-lyric"');
    expect(markup).toContain('data-fingering="1"');
    expect(markup).toContain('data-annotation-source="generated"');
    expect(markup).toContain('data-annotation-status="candidate"');
    expect(markup).toContain("结合当前手位、前后音和乐句方向生成。");
  });

  it("v2 score_document 的五线谱辅助路径包含 staff aid 静态标记", () => {
    const document = make_score_document();
    const markup = renderToStaticMarkup(
      <StaffAidRenderer
        score={to_render_score_from_score_document(document)}
        show_fingerings
      />,
    );

    expect(markup).toContain('data-staff-aid="true"');
    expect(markup).toContain(`data-score-document="${document.id}"`);
    expect(markup).toContain('class="staff-lyric"');
    expect(markup).toContain("Position: C4 Position");
    expect(markup).toContain("Move to D4 Position");
    expect(markup).toContain("Return to C4 Position");
    expect(markup).toContain('data-annotation-source="generated"');
    expect(markup).toContain('data-annotation-status="candidate"');
  });
});

function make_practice_score_with_score_document(): practice_score_with_score_document {
  const lesson = get_lesson("w1-d1-sight");
  if (!lesson) {
    throw new Error("Expected w1-d1-sight lesson");
  }
  return {
    ...lesson.score,
    score_document: make_score_document(),
  };
}

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
    id: "practice-score-v2-doc",
    number: "999",
    title: "PracticeScore v2 fixture",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    status: "published",
    provenance: {
      kind: "pptx",
      source_id: "practice-score-v2-doc",
      source_file: "practice-score-v2.pptx",
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
