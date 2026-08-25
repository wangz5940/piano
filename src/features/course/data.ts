import type {
  course,
  expected_step,
  fingering_guide,
  hand_mode,
  lesson,
  material_kind,
  practice_score,
  practice_day,
  score_source_reference_image,
} from "./types";
import { apply_step_fingerings } from "./fingerings";
import {
  build_harmonized_score,
  type accompaniment_style,
  type chord_symbol,
  type harmonized_measure,
} from "./harmony";
import { make_metered_steps, note_name } from "./scoreBuilders";
import { get_hymn_repertoire_entry } from "@/features/repertoire/hymns";

const major_scale = [0, 2, 4, 5, 7, 9, 11] as const;
const natural_minor_scale = [0, 2, 3, 5, 7, 8, 10] as const;

export const study_materials = {
  "john-thompson-easiest-1": {
    title: "约翰·汤普森简易钢琴教程 1",
    page_count: 45,
    usage: "第 1—4 周入门主教材：手指编号、中央 C、固定五指位置和最小双手。",
  },
  "john-thompson-easiest-2": {
    title: "约翰·汤普森简易钢琴教程 2",
    page_count: 52,
    usage: "第 5—8 周入门进阶教材：稳定双手进入、C/F/G 和弦与简单伴奏。",
  },
  beyer: {
    title: "拜厄钢琴基本教程",
    page_count: 102,
    usage: "第 9 周后系统主教材：只使用能说清指法、声部和页码的学生练习。",
  },
  hanon: {
    title: "哈农钢琴练指法",
    page_count: 119,
    usage: "第 13 周后辅助：每次最多 3—5 分钟，不替代曲目和简谱视奏。",
  },
} as const;

export const courses: course[] = [
  {
    id: "keyboard-foundation",
    title: "一、小汤 1 入门",
    short_title: "小汤 1",
    goal: "把简谱数字、手指编号和中央 C 附近的固定五指位置连起来。",
    material_note: "《约翰·汤普森简易钢琴教程 1》原 PDF + 配套预备谱 + 指法提示；候选 MusicXML 只做核对。",
    completion_standards: [
      "能说出左右手 1—5 指，并在中央 C 附近找到起始手位。",
      "能用固定五指位读完 2—4 小节新谱，指法不临时乱换。",
      "能完成右手旋律和最小左手支撑，不因一个错音停止整段。",
    ],
    order: 1,
    week_start: 1,
    week_end: 4,
    available: true,
  },
  {
    id: "chord-foundation",
    title: "二、小汤 2 基础双手",
    short_title: "小汤 2",
    goal: "让右手旋律和左手 C/F/G 简单和弦开始稳定配合。",
    material_note: "《约翰·汤普森简易钢琴教程 2》原 PDF + 配套预备谱 + 逐音指法提示；暂不使用哈农。",
    completion_standards: [
      "看到 C、F、G 标记时，能先摆好左手形状再落键。",
      "能用根音或柱式和弦给 4—8 小节熟悉旋律伴奏。",
      "换和弦时右手旋律不停，左手能在下一小节前准备位置。",
    ],
    order: 2,
    week_start: 5,
    week_end: 8,
    available: true,
  },
  {
    id: "hands-independence",
    title: "三、拜厄入门衔接",
    short_title: "拜厄",
    goal: "把小汤阶段的指法习惯迁移到拜厄，建立左右手独立。",
    material_note: "拜厄 PDF 第 7—17 页；每次只选可说明手位、指法和声部的小段。",
    completion_standards: [
      "能按纸本页码和学生声部完成指定小段，不把教师声部当作学生练习。",
      "能保持一只手稳定时，另一只手完成简单级进或保持音。",
      "能在错音后从下一拍恢复，而不是每次回到第一小节。",
    ],
    order: 3,
    week_start: 9,
    week_end: 12,
    available: true,
  },
  {
    id: "key-movement",
    title: "四、调性扩展与移动把位",
    short_title: "移动",
    goal: "在 C、G、F、D 和 A 小调中移动手位，并理解常用和弦转位。",
    material_note: "拜厄 PDF 第 18—40 页；第 13 周后可加入 3—5 分钟哈农第 1—5 条。",
    completion_standards: [
      "能在常用调中先找主音，再确认升降记号和起始手位。",
      "能用最近距离移动左手和弦，不必每次跳回原位。",
      "能在 3/4 和 6/8 拍中保持稳定大拍。",
    ],
    order: 4,
    week_start: 13,
    week_end: 20,
    available: true,
  },
  {
    id: "direct-sight-reading",
    title: "五、简谱直接双手弹奏",
    short_title: "视奏",
    goal: "看到简谱和和弦标记后，直接组织右手旋律与左手伴奏。",
    material_note: "拜厄 PDF 第 41—70 页；每周新简谱视奏，训练根音、柱式、低音加和弦和分解和弦。",
    completion_standards: [
      "能在 30 秒预读中确认调号、拍号、起始音和和弦变化。",
      "能为 16—32 小节新谱选择根音、柱式或分解伴奏。",
      "视奏中出现错音后不从头重来，能在下一拍或下一小节恢复。",
    ],
    order: 5,
    week_start: 21,
    week_end: 28,
    available: true,
  },
  {
    id: "complete-performance",
    title: "六、稳定性与完整演奏",
    short_title: "完整",
    goal: "连续演奏 3—5 首完整双手曲目，并能为右手谱补出左手和弦。",
    material_note: "拜厄 PDF 第 71—90 页；按需复习第 91—102 页音阶和调性关系。",
    completion_standards: [
      "能独立完成 16—32 小节适级新谱，保持拍点和双手连续性。",
      "即使只看到右手旋律，也能根据和弦标记补出左手根音、柱式或分解和弦伴奏型。",
      "能完成一首完整双手曲目，做到旋律突出、句尾收束、错音后继续。",
      "能说出自己的调性、节奏、指法或和弦问题，并选择对应补练方法。",
    ],
    order: 6,
    week_start: 29,
    week_end: 36,
    available: true,
  },
];

interface key_profile {
  key_signature: string;
  tonic_midi: number;
  scale_intervals: readonly number[];
  time_signature: string;
  beats_per_measure: number;
  chords: readonly chord_symbol[];
}

interface week_profile extends key_profile {
  week_number: number;
  course_id: string;
  theme: string;
  objective: string;
  method_title: string;
  method_pages: number[];
  method_kind: Extract<material_kind, "john-thompson-easiest-1" | "john-thompson-easiest-2" | "beyer">;
  method_status: practice_score["source"]["status"];
  technique_focus: string;
  repertoire_title: string;
  sight_measures: number;
  accompaniment_style: accompaniment_style;
}

const week_themes = [
  "手指编号与中央 C",
  "右手五指位",
  "左手五指位",
  "最小双手连接",
  "小汤 2 双手进入",
  "C/F/G 根音伴奏",
  "柱式和弦",
  "八小节完整连接",
  "拜厄触键衔接",
  "左右手保持音",
  "分手到合手",
  "拜厄入门检查",
  "G 大调五指位置",
  "F 大调与三拍子",
  "D 大调移动把位",
  "A 小调色彩",
  "和弦转位",
  "6/8 拍流动感",
  "延音与切分预备",
  "多调综合",
  "C-G-Am-F 根音",
  "柱式和弦直接伴奏",
  "分解和弦直接伴奏",
  "低音加和弦",
  "提前阅读下一小节",
  "附点与十六分预备",
  "24 小节连续视奏",
  "32 小节直接弹奏",
  "C/G 大调完整演奏",
  "F/D 大调完整演奏",
  "力度与奏法层次",
  "和声与踏板预备",
  "完整曲目一",
  "完整曲目二",
  "模拟演奏",
  "36 周结业检查",
] as const;

const repertoire_titles = [
  "《欢乐颂》主题",
  "《小星星》前两句",
  "《两只老虎》",
  "《玛丽有只小羊羔》",
  "《生日快乐》伴奏版",
  "《送别》入门版",
  "《欢乐颂》和弦版",
  "《小星星》完整连接",
  "《茉莉花》骨架",
  "钟摆问答",
  "短线与长线",
  "两条河",
  "向北的风",
  "纸上圆舞曲",
  "晴日台阶",
  "黄昏小路",
  "近距离换和弦",
  "摇船",
  "越过拍点",
  "四种颜色",
  "四和弦日记",
  "窗边四拍",
  "流动的灯",
  "稳稳向前",
  "看见下一站",
  "雨点节奏",
  "不断线",
  "第一次远行",
  "晨光序曲",
  "四季台阶",
  "远近之间",
  "水面倒影",
  "晨光序曲·完整版",
  "向北的风·完整版",
  "小型演奏会",
  "结业演奏",
] as const;

const lesson_focus_by_day = [
  "分手读谱与慢速定位",
  "小节连接与换和弦准备",
  "从第一小节连续弹到最后一小节",
] as const;

const base_melody_patterns = [
  [1, 2, 3, 5, 3, 2, 1, 2],
  [3, 5, 6, 5, 4, 3, 2, 1],
  [1, 3, 5, 3, 2, 4, 3, 1],
  [5, 5, 6, 5, 4, 3, 2, 1],
] as const;

const source_reference_image: score_source_reference_image = {
  url: "/materials/repertoire/twinkle-source.png",
  alt: "《小星星》源简谱",
  title: "《小星星》源简谱",
  caption: "课程使用重新编配的教学谱，源简谱只作为旋律来源核对。",
};

function build_week_profile(week_number: number): week_profile {
  const course = courses.find((item) =>
    week_number >= item.week_start && week_number <= item.week_end);
  if (!course) {
    throw new Error(`缺少第 ${week_number} 周课程阶段`);
  }

  const key_profile = get_key_profile(week_number);
  const method_kind = get_method_kind(week_number);
  return {
    ...key_profile,
    week_number,
    course_id: course.id,
    theme: week_themes[week_number - 1],
    objective: get_week_objective(week_number),
    method_title: get_method_title(week_number),
    method_pages: get_method_pages(week_number),
    method_kind,
    method_status: "needs_review",
    technique_focus: get_technique_focus(week_number),
    repertoire_title: repertoire_titles[week_number - 1],
    sight_measures: get_sight_measure_count(week_number),
    accompaniment_style: get_accompaniment_style(week_number),
  };
}

function get_key_profile(week_number: number): key_profile {
  if ([13, 18, 25, 28, 29, 34].includes(week_number)) {
    return {
      key_signature: "G 大调（1 = G）",
      tonic_midi: 67,
      scale_intervals: major_scale,
      time_signature: week_number === 18 ? "6/8" : "4/4",
      beats_per_measure: week_number === 18 ? 6 : 4,
      chords: ["G", "D", "Em", "C"],
    };
  }
  if ([14, 19, 24, 30, 35].includes(week_number)) {
    return {
      key_signature: "F 大调（1 = F）",
      tonic_midi: 65,
      scale_intervals: major_scale,
      time_signature: week_number === 14 ? "3/4" : "4/4",
      beats_per_measure: week_number === 14 ? 3 : 4,
      chords: ["F", "C", "Dm", "C"],
    };
  }
  if ([15, 20, 26, 31].includes(week_number)) {
    return {
      key_signature: "D 大调（1 = D）",
      tonic_midi: 62,
      scale_intervals: major_scale,
      time_signature: week_number === 31 ? "3/4" : "4/4",
      beats_per_measure: week_number === 31 ? 3 : 4,
      chords: ["D", "A", "Bm", "G"],
    };
  }
  if (week_number === 16) {
    return {
      key_signature: "A 自然小调（1 = A）",
      tonic_midi: 69,
      scale_intervals: natural_minor_scale,
      time_signature: "4/4",
      beats_per_measure: 4,
      chords: ["Am", "F", "G", "E"],
    };
  }
  return {
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    scale_intervals: major_scale,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["C", "G", "Am", "F"],
  };
}

function get_method_kind(week_number: number): week_profile["method_kind"] {
  if (week_number <= 4) {
    return "john-thompson-easiest-1";
  }
  if (week_number <= 8) {
    return "john-thompson-easiest-2";
  }
  return "beyer";
}

function get_method_title(week_number: number): string {
  if (week_number <= 4) {
    return `小汤 1 · 第 ${week_number} 周固定五指与逐音指法`;
  }
  if (week_number <= 8) {
    return `小汤 2 · 第 ${week_number} 周双手与和弦预备`;
  }
  if (week_number <= 12) {
    return `拜厄 PDF 第 ${7 + (week_number - 9) * 3}—${9 + (week_number - 9) * 3} 页 · 学生声部小段`;
  }
  return `拜厄 PDF 第 ${Math.min(90, 18 + (week_number - 13) * 3)} 页附近 · 阶段练习`;
}

function get_method_pages(week_number: number): number[] {
  if (week_number <= 4) {
    return [11 + (week_number - 1) * 2, 12 + (week_number - 1) * 2];
  }
  if (week_number <= 8) {
    return [6 + (week_number - 5) * 3, 7 + (week_number - 5) * 3];
  }
  if (week_number <= 12) {
    const start = 7 + (week_number - 9) * 3;
    return [start, start + 1, start + 2];
  }
  const page = Math.min(90, 18 + (week_number - 13) * 3);
  return [page];
}

function get_week_objective(week_number: number): string {
  if (week_number <= 4) {
    return "先把手指编号、中央 C 和固定手位变成稳定动作。";
  }
  if (week_number <= 8) {
    return "让双手进入更自然，并开始用左手和弦支撑右手旋律。";
  }
  if (week_number <= 12) {
    return "把小汤阶段的读指法习惯迁移到拜厄小段。";
  }
  if (week_number <= 20) {
    return "扩展常用调、移动把位和基础节奏型。";
  }
  if (week_number <= 28) {
    return "看到简谱和和弦标记后，直接组织双手。";
  }
  return "稳定完成完整双手曲目，并为右手谱补出左手和弦。";
}

function get_technique_focus(week_number: number): string {
  if (week_number <= 4) {
    return "五指位置、放松触键和逐音指法";
  }
  if (week_number <= 8) {
    return "C/F/G 和弦形状与根音伴奏";
  }
  if (week_number <= 12) {
    return "左右手保持音与简单分工";
  }
  if (week_number <= 20) {
    return "调性移动、转位和 3—5 分钟哈农放松检查";
  }
  if (week_number <= 28) {
    return "和弦标记到左手伴奏型的即时转换";
  }
  return "完整演奏稳定性、分解和弦和恢复能力";
}

function get_sight_measure_count(week_number: number): number {
  if (week_number <= 4) {
    return 4;
  }
  if (week_number <= 12) {
    return 8;
  }
  if (week_number <= 26) {
    return 16;
  }
  if (week_number === 27 || week_number === 31 || week_number === 32) {
    return 24;
  }
  return 32;
}

function get_accompaniment_style(week_number: number): accompaniment_style {
  if (week_number <= 4) {
    return "none";
  }
  if (week_number <= 8) {
    return "root";
  }
  if (week_number <= 21) {
    return "root";
  }
  if (week_number === 22) {
    return "block";
  }
  if (week_number === 23) {
    return "broken";
  }
  if (week_number <= 28) {
    return "bass_chord";
  }
  return "broken";
}

const week_profiles = Array.from({ length: 36 }, (_, index) => build_week_profile(index + 1));

function create_day_lessons(profile: week_profile, day_index: 1 | 2 | 3): lesson[] {
  const base_id = `w${profile.week_number}-d${day_index}`;
  const focus = lesson_focus_by_day[day_index - 1];
  const method_steps = create_method_steps(profile, day_index);
  const technique_steps = create_technique_steps(profile, day_index);
  const repertoire_steps = create_repertoire_steps(profile);
  const hymn_entry = get_hymn_for_week(profile.week_number);
  const repertoire_score = hymn_entry?.score ?? create_score(`${base_id}-repertoire-score`, `${profile.repertoire_title} · 完整 ${get_measure_count(repertoire_steps)} 小节谱`, repertoire_steps, profile, {
    source: create_repertoire_source(profile),
  });
  const is_hymn_ooxml_reference = Boolean(
    hymn_entry && repertoire_score.steps.length === 0,
  );
  const sight_steps = create_sight_steps(profile, day_index);

  return [
    make_lesson(`${base_id}-warmup`, profile, day_index, {
      title: "热身与手型",
      description: "放松肩、腕和手指，用很慢的速度确认今天的手位。",
      guidance: "每个音落下前先看手指编号；如果前臂紧张，立即停下甩手并降速。",
      objective: "建立放松、可控制的起点。",
      hand_mode: "both",
      target_bpm: 48,
      estimated_minutes: 5,
      material_kind: "warmup",
      exercise_type: "warmup",
      practice_mode: "guided_input",
      source_ref: "原创热身与手型预备谱",
      score: create_score(`${base_id}-warmup-score`, "本日手型与触键预备谱", create_warmup_steps(profile), profile, {
        source: { kind: "inline", status: "published", label: "原创热身谱" },
      }),
    }),
    make_lesson(`${base_id}-method`, profile, day_index, {
      title: `${profile.method_title} · ${focus}`,
      description: "按纸本顺序练完本日教材小段，重点说清手位、指法和需要注意的位置。",
      guidance: "先读曲名、页码、手别和起始手位，再慢速弹完整段；难点回练后必须重新完整连接。",
      objective: "把教材内容落实为可复盘的动作。",
      hand_mode: get_steps_hand_mode(method_steps),
      target_bpm: 48,
      estimated_minutes: 20,
      material_kind: profile.method_kind,
      exercise_type: "method",
      practice_mode: "manual_checklist",
      source_ref: `${study_materials[profile.method_kind].title} · 原 PDF 第 ${profile.method_pages.join("、")} 页 · 候选谱待审核`,
      score: create_score(`${base_id}-method-score`, `${profile.method_title} · 配套预备谱`, method_steps, profile, {
        source: {
          kind: "reference",
          status: profile.method_status,
          label: `${study_materials[profile.method_kind].title} · 原 PDF 页码核对`,
          source_page: profile.method_pages[0],
        },
        source_fingering: [create_method_fingering_annotation(profile)],
      }),
    }),
    make_lesson(`${base_id}-technique`, profile, day_index, {
      title: `${profile.technique_focus} · ${day_index === 3 ? "完整连接" : "分步练习"}`,
      description: "用短小技术片段建立键盘位置、和弦形状和节拍稳定性。",
      guidance: profile.week_number >= 13
        ? "如手腕和前臂保持放松，可先用 3 分钟哈农第 1—5 条之一热手，再完成本项和弦或音阶。"
        : "先慢速说出音名、手指和和弦名称，再连续弹两遍。",
      objective: "建立键盘位置和和声反应。",
      hand_mode: get_steps_hand_mode(technique_steps),
      target_bpm: profile.week_number >= 21 ? 60 : 52,
      pass_accuracy: 0.8,
      estimated_minutes: 10,
      material_kind: profile.week_number >= 5 ? "chord" : "scale",
      exercise_type: "technique",
      practice_mode: "guided_input",
      source_ref: profile.week_number >= 13
        ? "原创技术谱；哈农仅作 3—5 分钟放松辅助"
        : "原创技术谱",
      score: create_score(`${base_id}-technique-score`, `${profile.technique_focus} · 技术谱`, technique_steps, profile, {
        source: { kind: "inline", status: "published", label: "原创技术谱" },
      }),
    }),
    make_lesson(`${base_id}-repertoire`, profile, day_index, {
      title: hymn_entry
        ? is_hymn_ooxml_reference
          ? `${hymn_entry.title} · PPTX OOXML 来源核对 · ${focus}`
          : `${hymn_entry.title} · 完整 ${get_measure_count(repertoire_score.steps)} 小节诗歌教学谱 · ${focus}`
        : `${profile.repertoire_title} · 完整 ${get_measure_count(repertoire_steps)} 小节 · ${focus}`,
      description: hymn_entry
        ? is_hymn_ooxml_reference
          ? "查看已接入的诗歌 PPTX OOXML 来源，等待校对后再进入跟弹。"
          : "把今天的手位、节拍和左手伴奏带进一首熟悉诗歌。"
        : "把今天的手位、节拍和左手伴奏带进一首固定曲目。",
      guidance: hymn_entry
        ? is_hymn_ooxml_reference
          ? "先核对 PPTX OOXML 来源、歌词和待审核状态；发布 ScoreDocument v2 前不做实时判定。"
          : "先看 PPTX 来源的歌词和分句，再用已发布教学谱练手位、指法与和弦。第三次要从第一小节连续到最后一小节。"
        : "本周三次使用同一份完整谱；可以改变训练重点，但第三次要从第一小节连续到最后一小节。",
      objective: "把技术应用到完整旋律。",
      hand_mode: is_hymn_ooxml_reference
        ? "both"
        : get_steps_hand_mode(repertoire_score.steps),
      target_bpm: profile.week_number >= 21 ? 56 : 50,
      pass_accuracy: is_hymn_ooxml_reference ? undefined : 0.78,
      estimated_minutes: 15,
      material_kind: "piece",
      exercise_type: "repertoire",
      practice_mode: is_hymn_ooxml_reference
        ? "manual_checklist"
        : "guided_input",
      source_ref: hymn_entry
        ? is_hymn_ooxml_reference
          ? `${hymn_entry.title} · PPTX OOXML 待审核来源`
          : `${hymn_entry.title} · 已发布诗歌教学谱`
        : get_repertoire_source_ref(profile),
      score: repertoire_score,
    }),
    make_lesson(`${base_id}-sight`, profile, day_index, {
      title: `第 ${profile.week_number} 周 ${profile.key_signature.split("（")[0]} ${profile.sight_measures} 小节新谱视奏`,
      description: "这是今天唯一不要求提前练熟的材料。先预读 30 秒，再尽量不停地弹完。",
      guidance: "可以慢，但尽量不停。错一个音后继续走，结束后只记录一个最需要改进的位置。",
      objective: "训练陌生材料的连续阅读。",
      hand_mode: get_steps_hand_mode(sight_steps),
      target_bpm: profile.week_number >= 21 ? 54 : 48,
      estimated_minutes: 10,
      material_kind: "sight_reading",
      exercise_type: "sight_reading",
      practice_mode: "timed_reading",
      source_ref: "原创简谱视奏谱",
      score: create_score(`${base_id}-sight-score`, `完整 ${profile.sight_measures} 小节视奏谱`, sight_steps, profile, {
        source: { kind: "inline", status: "published", label: "原创简谱视奏谱" },
      }),
    }),
  ];
}

function create_warmup_steps(profile: week_profile): expected_step[] {
  const tonic = profile.tonic_midi;
  return apply_step_fingerings(make_metered_steps("warmup", [
    { notation: "右 1", notes: [tonic], hand: "right" },
    { notation: "右 2", notes: [tonic + 2], hand: "right" },
    { notation: "左 5", notes: [tonic - 12], hand: "left" },
    { notation: "左 1", notes: [tonic - 5], hand: "left" },
  ], 4), { tonic_midi: tonic });
}

function create_method_steps(profile: week_profile, day_index: 1 | 2 | 3): expected_step[] {
  const measure_count = profile.week_number <= 4 ? 4 : profile.week_number <= 8 ? 6 : 8;
  const style = profile.week_number <= 4
    ? (day_index === 3 ? "root" : "none")
    : profile.week_number <= 8
      ? (day_index === 1 ? "root" : "block")
      : "root";
  const measures = create_harmonized_measures(profile, measure_count, day_index);
  const steps = build_harmonized_score({
    prefix: `method-w${profile.week_number}-d${day_index}`,
    key_tonic_midi: profile.tonic_midi,
    scale_intervals: profile.scale_intervals,
    beats_per_measure: profile.beats_per_measure,
    measures,
    style,
  });

  if (profile.week_number <= 4 && day_index < 3) {
    return steps.map((step) => ({
      ...step,
      notes: step.notes.slice(-1),
      note_names: step.notes.slice(-1).map(note_name),
      hand: "right",
      match_mode: "single_note",
    }));
  }
  return apply_step_fingerings(steps, { tonic_midi: profile.tonic_midi });
}

function create_technique_steps(profile: week_profile, day_index: 1 | 2 | 3): expected_step[] {
  const style: accompaniment_style = profile.week_number < 5
    ? "none"
    : profile.week_number < 21
      ? (day_index === 1 ? "root" : "block")
      : get_accompaniment_style(profile.week_number);
  return build_harmonized_score({
    prefix: `technique-w${profile.week_number}-d${day_index}`,
    key_tonic_midi: profile.tonic_midi,
    scale_intervals: profile.scale_intervals,
    beats_per_measure: profile.beats_per_measure,
    measures: create_harmonized_measures(profile, 4, day_index + 1),
    style,
  });
}

function create_repertoire_steps(profile: week_profile): expected_step[] {
  const measure_count = get_repertoire_measure_count(profile.week_number);
  const style = profile.week_number <= 4
    ? "root"
    : profile.accompaniment_style;
  return build_harmonized_score({
    prefix: `repertoire-w${profile.week_number}`,
    key_tonic_midi: profile.tonic_midi,
    scale_intervals: profile.scale_intervals,
    beats_per_measure: profile.beats_per_measure,
    measures: create_harmonized_measures(profile, measure_count, 0),
    style,
  });
}

function get_hymn_for_week(week_number: number) {
  const hymn_by_week: Record<number, string> = {
    9: "hymn-371-jesus-loves-me",
    12: "hymn-240-tis-so-sweet-to-trust-in-jesus",
    16: "hymn-285-what-a-friend-we-have-in-jesus",
    20: "hymn-461-amazing-grace",
    24: "hymn-037-jesus-lover-of-my-soul",
    28: "hymn-200-trust-and-obey",
    32: "hymn-496-how-great-thou-art",
    36: "hymn-001-great-physician",
  };
  const hymn_id = hymn_by_week[week_number];
  return hymn_id ? get_hymn_repertoire_entry(hymn_id) : undefined;
}

function create_sight_steps(profile: week_profile, day_index: 1 | 2 | 3): expected_step[] {
  const style = profile.week_number <= 4 ? "none" : profile.accompaniment_style;
  return build_harmonized_score({
    prefix: `sight-w${profile.week_number}-d${day_index}`,
    key_tonic_midi: profile.tonic_midi,
    scale_intervals: profile.scale_intervals,
    beats_per_measure: profile.beats_per_measure,
    measures: create_harmonized_measures(profile, profile.sight_measures, day_index),
    style,
  });
}

function create_harmonized_measures(
  profile: week_profile,
  measure_count: number,
  variant: number,
): harmonized_measure[] {
  return Array.from({ length: measure_count }, (_, measure_index) => {
    const pattern = base_melody_patterns[(measure_index + variant) % base_melody_patterns.length];
    const chord = profile.chords[measure_index % profile.chords.length];
    return {
      chord,
      melody: Array.from({ length: profile.beats_per_measure }, (_, beat_index) => ({
        degree: pattern[(beat_index + measure_index) % pattern.length],
      })),
    };
  });
}

function get_repertoire_measure_count(week_number: number): number {
  if (week_number <= 4) {
    return 8;
  }
  if (week_number <= 8) {
    return 12;
  }
  if (week_number <= 20) {
    return 16;
  }
  if (week_number <= 28) {
    return week_number >= 27 ? 32 : 24;
  }
  return week_number >= 33 ? 32 : 24;
}

function get_repertoire_source_ref(profile: week_profile): string {
  if (profile.repertoire_title.includes("小星星")) {
    return "《小星星》源简谱旋律 · 课程重新编配左手伴奏";
  }
  return profile.week_number >= 21
    ? "原创曲目 · 根据和弦标记生成左手伴奏"
    : "原创教学曲目";
}

function create_repertoire_source(profile: week_profile): practice_score["source"] {
  return {
    kind: "inline",
    status: "published",
    label: get_repertoire_source_ref(profile),
    reference_image: profile.repertoire_title.includes("小星星")
      ? source_reference_image
      : undefined,
  };
}

function create_method_fingering_annotation(profile: week_profile) {
  return {
    summary: `${study_materials[profile.method_kind].title} 指法候选与人工提示`,
    source_pages: profile.method_pages,
    rules: [
      {
        id: `${profile.method_kind}-position`,
        label: "起始手位",
        text: profile.week_number <= 8
          ? "先按固定五指位摆好手，再逐音读指法数字。"
          : "先确认原谱页码、学生声部和左右手范围，再开始弹。",
        source: "manual_mapping" as const,
        hand: "both" as const,
      },
      {
        id: `${profile.method_kind}-fingering-candidate`,
        label: "候选指法",
        text: "OCR 指法候选只能辅助核对，未人工确认前不得作为判定标准。",
        source: "manual_mapping" as const,
      },
    ],
    limitation: "当前教材 MusicXML 和 OCR 指法仍是待审核资源；课程内逐音指法以人工预备谱为准。",
  };
}

function create_score(
  id: string,
  title: string,
  steps: expected_step[],
  profile: key_profile,
  options: {
    source: practice_score["source"];
    finger_guide?: fingering_guide;
    source_fingering?: practice_score["source_fingering"];
  },
): practice_score {
  const fingered_steps = apply_step_fingerings(steps, { tonic_midi: profile.tonic_midi });
  return {
    id,
    title,
    key_signature: profile.key_signature,
    jianpu_tonic_midi: profile.tonic_midi,
    time_signature: profile.time_signature,
    beats_per_measure: profile.beats_per_measure,
    tempo_hint: "先慢速完整连接；连续两遍稳定后再提高速度。",
    start_position: get_start_position(profile),
    finger_hint: get_finger_hint(fingered_steps),
    finger_guide: options.finger_guide ?? create_default_fingering_guide(profile),
    source: options.source,
    source_fingering: options.source_fingering,
    steps: fingered_steps,
  };
}

function create_default_fingering_guide(profile: key_profile): fingering_guide {
  return {
    preparation: [
      `先确认 ${profile.key_signature}、${profile.time_signature} 和起始手位。`,
      "右手读旋律数字，左手先在空中摆出本小节和弦形状。",
    ],
    actions: [
      "每小节先看左手和弦，再弹右手旋律。",
      "遇到双手同时落键时，先慢速对齐拍点，再追求速度。",
    ],
    success_checks: [
      "旋律不断，左手换和弦时不抢拍。",
      "错音后能在下一拍或下一小节恢复。",
    ],
    common_mistakes: [
      "左手只弹第一拍后就停住；改为按本项伴奏型补足全小节。",
      "右手看一个音弹一个音；改为提前看下一拍和下一小节和弦。",
    ],
    position_strategy: [
      `先找调性：${profile.key_signature} 表示 1 对应 ${note_name(profile.tonic_midi)}，所以右手 1 指优先放在这个主音附近。`,
      "再看旋律跨度：如果本句大多在五度内，就用固定五指位置；超过五度或下一句够不到时，才移动手位。",
      `本课默认手位覆盖 ${note_name(profile.tonic_midi)} 到 ${note_name(profile.tonic_midi + 7)} 附近，目的是先少移动、保持连贯。`,
      `左手不从旋律猜和弦，而是直接看和弦标记；本课先准备 ${profile.chords.join(" → ")} 的根音或和弦形状。`,
    ],
    fingering_rules: [
      "固定五指位置内，右手从主音开始通常按 1-2-3-4-5 顺序安排；这就是为什么 1=C4 时，C 用 1、D 用 2、E 用 3。",
      "如果旋律从 3 或 5 开始，会先把它放进当前五指位置中判断：3 是主音上方第三个音，所以常用 3 指；5 是当前手位最高附近的音，若后面还要继续上行，就可能不用 5 指而改用 2/3 指预留位置。",
      "黑键优先给 2、3、4 指，拇指尽量少弹黑键；遇到 F#、C# 时先检查是否需要把手位整体移动。",
      "重要旋律音、重音或需要唱出来的音优先给 2、3、4 这些更稳定的手指，不只看单个音是否最顺手。",
      "指法要提前看下一小节：如果当前手指会让下一句没手可用，就要提前换位、穿指或改用另一套固定手位。",
    ],
    self_check: [
      "先说出本课调性和主音，再说右手 1 指应该放在哪个琴键。",
      "圈出本句最低音和最高音，确认五指位置是否能覆盖。",
      "逐个说明前三个音为什么用这些手指：它们在当前手位中分别是第几个音？后面是否需要预留手指？",
      "看到左手和弦时，先说出根音、三音、五音，再用 5-3-1 或对应转位落键。",
    ],
    position_map: create_position_map(profile),
  };
}

function create_position_map(profile: key_profile): fingering_guide["position_map"] {
  const tonic = profile.tonic_midi;
  const primary_intervals = profile.scale_intervals.slice(0, 5);
  const shifted_intervals = profile.scale_intervals.slice(1, 6);
  const primary_notes = primary_intervals.map((interval) => note_name(tonic + interval));
  const shifted_tonic = tonic + shifted_intervals[0];
  const shifted_notes = shifted_intervals.map((interval) => note_name(tonic + interval));
  return [
    {
      label: `${note_name(tonic)} Position`,
      start_note: note_name(tonic),
      notes: primary_notes,
      fingers: ["1", "2", "3", "4", "5"],
      applies_to: "本课默认手位；旋律在五度内时优先使用。",
      reason: "先建立手位意识：不是先背每个数字，而是先知道整只手放在哪里。",
      movement: "stay",
    },
    {
      label: `${note_name(shifted_tonic)} Position`,
      start_note: note_name(shifted_tonic),
      notes: shifted_notes,
      fingers: ["1", "2", "3", "4", "5"],
      applies_to: "当旋律上行到 6 或当前五指位覆盖不舒服时，整只手向右移动一点。",
      reason: "移动手位比硬伸小指更放松，也能解释为什么同一个简谱数字在不同乐句可能换手指。",
      movement: "move",
    },
    {
      label: `Return to ${note_name(tonic)} Position`,
      start_note: note_name(tonic),
      notes: primary_notes,
      fingers: ["1", "2", "3", "4", "5"],
      applies_to: "旋律回到主音附近时回到原手位。",
      reason: "回位后后续级进旋律又能按固定五指位置判断，不需要重新背一串指法。",
      movement: "return",
    },
  ];
}

function get_start_position(profile: key_profile): string {
  return `右手 1 指放 ${note_name(profile.tonic_midi)} 附近；左手准备 ${profile.chords.join(" → ")} 的根音或和弦形状。`;
}

function get_finger_hint(steps: expected_step[]): string {
  const first = steps[0];
  if (!first?.fingerings?.length) {
    return "先说出手指编号，再慢速落键。";
  }
  const right = first.fingerings
    .filter((fingering) => fingering.hand === "right")
    .map((fingering) => fingering.finger);
  const left = first.fingerings
    .filter((fingering) => fingering.hand === "left")
    .map((fingering) => fingering.finger);
  if (left.length > 0 && right.length > 0) {
    return `第一拍左手 ${left.join("-")} 指，右手 ${right.join("-")} 指；先对齐再连续。`;
  }
  if (right.length > 0) {
    return `右手从 ${right.join("-")} 指开始，保持固定五指位。`;
  }
  return `左手从 ${left.join("-")} 指开始，先确认根音位置。`;
}

function get_steps_hand_mode(steps: expected_step[]): hand_mode {
  if (steps.some((step) => step.hand === "both")) {
    return "both";
  }
  if (steps.every((step) => step.hand === "left")) {
    return "left";
  }
  return "right";
}

function get_measure_count(steps: expected_step[]): number {
  return Math.max(...steps.map((step) => step.measure_index));
}

function make_lesson(
  id: string,
  profile: week_profile,
  day_index: 1 | 2 | 3,
  lesson_data: Omit<lesson, "id" | "course_id" | "week_number" | "day_index" | "steps">,
): lesson {
  return {
    ...lesson_data,
    id,
    course_id: profile.course_id,
    week_number: profile.week_number,
    day_index,
    steps: lesson_data.score.steps,
  };
}

export const lessons: lesson[] = week_profiles.flatMap((profile) =>
  ([1, 2, 3] as const).flatMap((day_index) => create_day_lessons(profile, day_index)),
);

export const practice_days: practice_day[] = week_profiles.flatMap((profile) =>
  ([1, 2, 3] as const).map((day_index) => {
    const base_id = `w${profile.week_number}-d${day_index}`;
    return {
      id: base_id,
      course_id: profile.course_id,
      week_number: profile.week_number,
      day_index,
      title: `第 ${profile.week_number} 周第 ${day_index} 次 · ${profile.theme}`,
      objective: `${profile.objective} 本次重点：${lesson_focus_by_day[day_index - 1]}。`,
      time_budget_minutes: 60,
      lesson_ids: [
        `${base_id}-warmup`,
        `${base_id}-method`,
        `${base_id}-technique`,
        `${base_id}-repertoire`,
        `${base_id}-sight`,
      ],
    };
  }),
);

export function get_lesson(lesson_id: string | undefined): lesson | undefined {
  return lessons.find((lesson_data) => lesson_data.id === lesson_id);
}

export function get_course(course_id: string): course | undefined {
  return courses.find((course_data) => course_data.id === course_id);
}

export function get_practice_day(practice_day_id: string | undefined): practice_day | undefined {
  return practice_days.find((practice_day) => practice_day.id === practice_day_id);
}

export function get_lessons_for_day(practice_day: practice_day): lesson[] {
  return practice_day.lesson_ids
    .map((lesson_id) => get_lesson(lesson_id))
    .filter((lesson_data): lesson_data is lesson => Boolean(lesson_data));
}

export function get_days_for_course(course_id: string): practice_day[] {
  return practice_days.filter((practice_day) => practice_day.course_id === course_id);
}
