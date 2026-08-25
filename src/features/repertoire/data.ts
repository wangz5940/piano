import { get_lesson } from "@/features/course/data";
import { apply_step_fingerings } from "@/features/course/fingerings";
import {
  make_measure_steps,
  make_variable_measure_steps,
  type note_seed,
} from "@/features/course/scoreBuilders";
import type {
  fingering_guide,
  practice_score,
} from "@/features/course/types";
import { hymn_repertoire_entries } from "./hymns";

import { imported_jianpu_structured_entries } from "./importedJianpuStructuredData";

export { imported_jianpu_entries } from "./importedJianpuData";
export type { imported_jianpu_entry } from "./importedJianpuData";
export { hymn_repertoire_entries };

export interface repertoire_entry {
  id: string;
  title: string;
  attribution: string;
  level: "入门" | "基础" | "进阶预备";
  recommended_weeks: string;
  learning_goal: string;
  rights_note: string;
  source_url?: string;
  score: practice_score;
}

const public_domain_note = "原作旋律属于公版；当前谱面与伴奏为练琴簿重新编写的适级教学版。";
const imported_teaching_note = "该条目来自已授权导入原谱；当前练习谱已经根据原始 CCMZ 数据整理为整首结构化教学谱，原谱页图保留用于来源对照。";

export const repertoire_entries: repertoire_entry[] = [
  from_course_lesson({
    id: "ode-to-joy",
    lesson_id: "w1-d1-repertoire",
    title: "《欢乐颂》主题",
    attribution: "路德维希·凡·贝多芬",
    level: "入门",
    recommended_weeks: "第 1—8 周",
    learning_goal: "固定五指位、重复音、C 大调基础伴奏。",
    source_url: "https://imslp.org/wiki/Symphony_No.9%2C_Op.125_(Beethoven%2C_Ludwig_van)",
  }),
  from_course_lesson({
    id: "twinkle-twinkle",
    lesson_id: "w2-d3-repertoire",
    title: "《小星星》",
    attribution: "法国传统旋律",
    level: "入门",
    recommended_weeks: "第 2—8 周",
    learning_goal: "2/4 拍、完整 24 小节、左右手双行简谱与圈号指法。",
  }),
  from_course_lesson({
    id: "frere-jacques",
    lesson_id: "w3-d1-repertoire",
    title: "《两只老虎》",
    attribution: "法国传统轮唱曲",
    level: "入门",
    recommended_weeks: "第 3—8 周",
    learning_goal: "级进、重复乐句、左手稳拍。",
  }),
  from_course_lesson({
    id: "mary-had-a-little-lamb",
    lesson_id: "w4-d1-repertoire",
    title: "《玛丽有只小羊羔》",
    attribution: "美国传统童谣",
    level: "入门",
    recommended_weeks: "第 4—8 周",
    learning_goal: "三音位置、稳定四分音符与句尾保持。",
  }),
  from_course_lesson({
    id: "happy-birthday",
    lesson_id: "w5-d1-repertoire",
    title: "《生日快乐》",
    attribution: "Patty Hill、Mildred J. Hill",
    level: "基础",
    recommended_weeks: "第 5—12 周",
    learning_goal: "弱起、附点感、三拍子与基础和弦。",
  }),
  from_course_lesson({
    id: "farewell",
    lesson_id: "w6-d1-repertoire",
    title: "《送别》",
    attribution: "旋律：John P. Ordway；中文歌曲版本：李叔同",
    level: "基础",
    recommended_weeks: "第 6—16 周",
    learning_goal: "长乐句、移动把位与旋律层次。",
  }),
  {
    id: "fur-elise-theme",
    title: "《致爱丽丝》主题旋律骨架",
    attribution: "路德维希·凡·贝多芬，WoO 59",
    level: "进阶预备",
    recommended_weeks: "第 16—28 周",
    learning_goal: "半音邻接、弱起、A 小调手位与右手旋律连贯。",
    rights_note: public_domain_note,
    source_url: "https://imslp.org/wiki/F%C3%BCr_Elise%2C_WoO_59_(Beethoven%2C_Ludwig_van)",
    score: create_score(
      "fur-elise-theme",
      "《致爱丽丝》开头主题 · 右手旋律骨架预备",
      "A 小调（1 = A）",
      69,
      "3/8",
      3,
      [
        [
          note("5", 76, 0.5), note("#4", 75, 0.5), note("5", 76, 0.5),
          note("#4", 75, 0.5), note("5", 76, 0.5), note("3", 71, 0.5),
        ],
        [note("5低", 74, 0.5), note("4低", 72, 0.5), note("2低", 69, 2)],
        [note("1低", 60), note("3低", 64), note("2低", 69)],
        [note("3", 71), note("3低", 64), note("#5低", 68)],
        [note("3", 71), note("4", 72), note("5", 76)],
        [note("3", 71), note("5低", 74), note("4低", 72)],
        [note("5低", 74), note("4低", 72), note("2低", 69)],
        [note("2低", 69, 3)],
      ],
      "右手先找 E5 与 D♯5；1 指在 A4 附近准备，开头两个音用相邻手指交替。",
      "开头 E-D♯ 不要用同一根手指滑动；本谱先练右手音序，原作休止与左手分解和弦在后续完整谱中学习。",
    ),
  },
  {
    id: "canon-harmony",
    title: "《D 大调卡农》和声骨架",
    attribution: "约翰·帕赫贝尔，P.37",
    level: "基础",
    recommended_weeks: "第 17—28 周",
    learning_goal: "听懂八和弦循环，并把柱式和弦改成持续分解伴奏。",
    rights_note: public_domain_note,
    source_url: "https://imslp.org/wiki/Canon_and_Gigue_in_D_major%2C_P.37_(Pachelbel%2C_Johann)",
    score: create_score(
      "canon-harmony",
      "《D 大调卡农》和声循环 · 8 小节教学版",
      "D 大调（1 = D）",
      62,
      "4/4",
      4,
      [
        chord_measure("D", [50, 54, 57], [66, 69]),
        chord_measure("A", [45, 49, 52], [64, 69]),
        chord_measure("Bm", [47, 50, 54], [62, 66]),
        chord_measure("F♯m", [42, 45, 49], [61, 66]),
        chord_measure("G", [43, 47, 50], [59, 62]),
        chord_measure("D", [50, 54, 57], [57, 62]),
        chord_measure("G", [43, 47, 50], [59, 62]),
        chord_measure("A", [45, 49, 52], [61, 64]),
      ],
      "左手先找每小节根音，右手只弹上方两个和弦音；先逐小节摆形。",
      "每小节第一拍两手同时落下，保持四拍；熟练后再把左手拆成根音-五音-三音-五音。",
    ),
  },
  {
    id: "minuet-in-g",
    title: "《G 大调小步舞曲》前句",
    attribution: "Christian Petzold，BWV Anh.114（旧时误署 J. S. Bach）",
    level: "进阶预备",
    recommended_weeks: "第 18—32 周",
    learning_goal: "三拍子重心、F♯、分句和左右手对话。",
    rights_note: public_domain_note,
    source_url: "https://imslp.org/wiki/Minuet_in_G_major%2C_BWV_Anh.114_(Pezold%2C_Christian)",
    score: create_score(
      "minuet-in-g",
      "《G 大调小步舞曲》前句 · 8 小节教学版",
      "G 大调（1 = G）",
      67,
      "3/4",
      3,
      [
        [note("5", 74), note("1", 67, 0.5), note("2", 69, 0.5), note("3", 71, 0.5), note("4", 72, 0.5)],
        [note("5", 74), note("1", 67, 2)],
        [note("6", 76), note("4", 72, 0.5), note("5", 74, 0.5), note("6", 76, 0.5), note("7", 78, 0.5)],
        [note("1高", 79), note("1", 67, 2)],
        [note("4", 72), note("5", 74, 0.5), note("4", 72, 0.5), note("3", 71, 0.5), note("2", 69, 0.5)],
        [note("3", 71), note("4", 72, 0.5), note("3", 71, 0.5), note("2", 69, 0.5), note("1", 67, 0.5)],
        [note("7低", 66), note("1", 67, 0.5), note("2", 69, 0.5), note("3", 71, 0.5), note("1", 67, 0.5)],
        [note("2", 69, 3)],
      ],
      "右手以 G4 五指位为中心；遇 F♯ 使用黑键，手腕不向右扭。",
      "每小节第一拍稍有重心，第二、三拍保持轻；一句结束前不要提前减速。",
    ),
  },
];

export const imported_teaching_entries: repertoire_entry[] =
  imported_jianpu_structured_entries.map((entry) => ({
    id: entry.id,
    title: `${entry.title} · 整首`,
    attribution: entry.attribution,
    level: entry.measure_count <= 60 ? "基础" : "进阶预备",
    recommended_weeks: "授权导入 · 整首结构化",
    learning_goal: `完整练习 ${entry.measure_count} 小节，先分手确认旋律与伴奏，再按原谱节拍合手演奏。`,
    rights_note: entry.rights_note || imported_teaching_note,
    source_url: entry.source_url,
    score: create_score(
      entry.id,
      `${entry.title} · 整首导入整理版`,
      entry.key_signature,
      entry.tonic_midi,
      entry.time_signature,
      entry.measure_beats[0] ?? 4,
      entry.measures,
      "先从原谱第一页第一小节的左右手位置开始，确认调号、拍号和第一组音型后再进入完整演奏。",
      "整首先按 2—4 小节分段，右手旋律与左手伴奏分别稳定后再合手；遇到延音和跨拍持续音，保持原谱的按键时值。",
      {
        tempo_hint: `原谱速度约 ${entry.tempo_bpm} BPM；先降至 ${Math.max(40, Math.round(entry.tempo_bpm * 0.6))} BPM 分段练习。`,
        source_label: `授权导入原谱整理版：根据原始 CCMZ 数据完整整理 ${entry.measure_count} 小节。`,
        measure_beats: entry.measure_beats,
        measure_beat_units: entry.measure_beat_units,
        reference_image: {
          url: entry.preview_image.url,
          alt: entry.preview_image.alt,
          title: `${entry.title} 源简谱`,
          caption: `当前教学版依据原始 CCMZ 数据整理为整首 ${entry.measure_count} 小节，并保留原谱页图用于逐段核对。`,
        },
      },
    ),
  }));

function from_course_lesson({
  id,
  lesson_id,
  title,
  attribution,
  level,
  recommended_weeks,
  learning_goal,
  source_url,
}: Omit<repertoire_entry, "score" | "rights_note"> & { lesson_id: string }): repertoire_entry {
  const lesson = get_lesson(lesson_id);
  if (!lesson) {
    throw new Error(`曲目课程不存在：${lesson_id}`);
  }
  return {
    id,
    title,
    attribution,
    level,
    recommended_weeks,
    learning_goal,
    rights_note: public_domain_note,
    source_url,
    score: lesson.score,
  };
}

function note(notation: string, midi: number, duration_beats = 1): note_seed {
  return { notation, notes: [midi], hand: "right", duration_beats };
}

function chord_measure(
  chord_name: string,
  left_notes: number[],
  right_notes: number[],
): note_seed[] {
  return [{
    notation: chord_name,
    notes: [...left_notes, ...right_notes],
    hand: "both",
    duration_beats: 4,
  }];
}

function create_score(
  id: string,
  title: string,
  key_signature: string,
  tonic_midi: number,
  time_signature: string,
  beats_per_measure: number,
  measures: note_seed[][],
  start_position: string,
  finger_hint: string,
  options?: {
    tempo_hint?: string;
    source_label?: string;
    measure_beats?: number[];
    measure_beat_units?: number[];
    reference_image?: practice_score["source"]["reference_image"];
  },
): practice_score {
  const steps = options?.measure_beats
    ? make_variable_measure_steps(id, measures, options.measure_beats)
    : make_measure_steps(id, measures, beats_per_measure);
  const steps_with_fingerings = apply_step_fingerings(steps, { tonic_midi });

  return {
    id,
    title,
    key_signature,
    jianpu_tonic_midi: tonic_midi,
    time_signature,
    beats_per_measure,
    tempo_hint: options?.tempo_hint ?? "先以 44—52 BPM 分句练习，连续正确两遍后再连接。",
    start_position,
    finger_hint,
    finger_guide: create_fingering_guide(start_position, finger_hint),
    measure_beats: options?.measure_beats,
    measure_beat_units: options?.measure_beat_units,
    source: {
      kind: "inline",
      status: "published",
      label: options?.source_label ?? public_domain_note,
      reference_image: options?.reference_image,
    },
    steps: steps_with_fingerings,
  };
}

function create_fingering_guide(
  start_position: string,
  finger_hint: string,
): fingering_guide {
  return {
    preparation: [
      "先认清调号和拍号，再找谱面中的最高音、最低音和第一组手位。",
      start_position,
      "先不弹地在键面上走一遍指法，确认移动位置后再开始。",
    ],
    actions: [
      "先右手分句练，每句连续正确两遍后再加入左手。",
      finger_hint,
      "合手时把速度减半，先保住拍点，再处理音量和连奏。",
    ],
    success_checks: [
      "能从句首连续弹到句尾，不因一个错音停下。",
      "右手旋律比左手伴奏清楚，拍号重音位置正确。",
      "连续两遍使用相同指法，没有临时换指。",
    ],
    common_mistakes: [
      "只记手的位置不看谱：每次重练都先读第一个音和调号。",
      "合手后立刻加速：退回能完整控制的速度，每次只增加 4 BPM。",
      "左手过响盖住旋律：左手贴键轻弹，右手保持清楚线条。",
    ],
    position_strategy: [
      "先找调性和第一个旋律音，再决定右手 1 指放在哪个主音或邻近主音上。",
      "圈出本句最高音和最低音；五度以内优先固定手位，超过五度才考虑换位或穿指。",
      start_position,
    ],
    fingering_rules: [
      "固定五指位置内按音级顺序配指：主音附近通常从 1 指开始，级进上行依次使用 2、3、4、5。",
      "旋律重音优先使用 2、3、4 指；5 指尽量避免承担需要突出或马上转向的重音。",
      "如果下一个小节需要更高或更低的音，当前小节要提前预留手指，不只看当前音是否顺手。",
      finger_hint,
    ],
    self_check: [
      "说出本句调性、主音、最高音和最低音。",
      "说明当前手位为什么能覆盖这些音；如果不能覆盖，说明在哪里换位。",
      "选前三个旋律音，逐个说明它们在手位中对应第几个手指。",
    ],
    position_map: [
      {
        label: "Primary Position",
        start_note: start_position,
        notes: ["按本曲调性确定 1 指或 5 指起点"],
        fingers: ["1", "2", "3", "4", "5"],
        applies_to: "本曲主要旋律范围。",
        reason: "先确定手位，再把音符映射到手指；不要只背单个指法数字。",
        movement: "stay",
      },
    ],
  };
}
