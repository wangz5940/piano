import type { fingering_guide, practice_score } from "@/features/course/types";
import {
  hymn_pptx_ooxml_fallback_by_number,
  type hymn_pptx_ooxml_fallback,
} from "./hymnPptxOoxmlFallbacks";

export interface hymn_repertoire_entry {
  id: string;
  title: string;
  attribution: string;
  level: "入门" | "基础" | "进阶预备";
  recommended_weeks: string;
  learning_goal: string;
  rights_note: string;
  score: practice_score;
}

interface hymn_seed {
  id: string;
  number: string;
  title: string;
  attribution: string;
  level: hymn_repertoire_entry["level"];
  recommended_weeks: string;
  learning_goal: string;
  source_image: string;
  key_signature: string;
  tonic_midi: number;
  time_signature: string;
  beats_per_measure: number;
  chords: string[];
  melody: number[][];
  start_position: string;
  finger_hint: string;
  hand_position: {
    label: string;
    start_note: number;
    intervals: number[];
    applies_to: string;
    reason: string;
  };
}

const hymn_rights_note = "来自 `712首-文字` 的 PPTX OOXML 结构化来源；当前条目只作为待审核来源预览，不再使用旧 JPG/4 小节手写教学谱，也不参与实时判定。";

const hymn_seeds: hymn_seed[] = [
  {
    id: "hymn-371-jesus-loves-me",
    number: "371",
    title: "《耶稣爱我》",
    attribution: "诗歌 371 · 本地歌谱",
    level: "入门",
    recommended_weeks: "第 9—12 周",
    learning_goal: "C 大调五指位、童谣式级进、左手 C/G 根音支撑。",
    source_image: "/materials/hymns/371-jesus-loves-me.jpg",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["C", "G", "C", "G"],
    melody: [
      [1, 2, 3, 3],
      [3, 2, 1, 1],
      [5, 5, 4, 3],
      [2, 1, 2, 1],
    ],
    start_position: "右手 1 指放 C4，保持 C Position；左手先准备 C → G 的根音。",
    finger_hint: "右手按 C-D-E-F-G 的 1-2-3-4-5 固定五指位；左手 C 用 5 指、G 用 1 指。",
    hand_position: {
      label: "C4 Position",
      start_note: 60,
      intervals: [0, 2, 4, 5, 7],
      applies_to: "整首教学骨架以 C4 到 G4 为主。",
      reason: "旋律最低到 C4、最高到 G4，五指位置刚好覆盖，不需要换位。",
    },
  },
  {
    id: "hymn-240-tis-so-sweet-to-trust-in-jesus",
    number: "240",
    title: "《信靠耶稣何其甘甜》",
    attribution: "诗歌 240 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 12—18 周",
    learning_goal: "C 大调四和弦进行，右手保持歌唱线条，左手根音到柱式和弦。",
    source_image: "/materials/hymns/240-tis-so-sweet-to-trust-in-jesus.jpg",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["C", "F", "G", "C"],
    melody: [
      [3, 3, 2, 1],
      [4, 4, 3, 2],
      [5, 5, 6, 5],
      [3, 2, 1, 1],
    ],
    start_position: "右手 1 指放 C4；第二句遇到 A4 时可短暂向 D Position 借位。左手准备 C → F → G → C。",
    finger_hint: "前两小节用 C Position；到 A4 不硬伸小指，整手向右一点后再回 C Position。",
    hand_position: {
      label: "C4 Position + D4 Position",
      start_note: 60,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "前两小节固定手位，第三小节因旋律到 A4 需要轻微右移。",
      reason: "A4 超出 C 到 G 的五指覆盖；移动手位比小指硬伸更放松。",
    },
  },
  {
    id: "hymn-285-what-a-friend-we-have-in-jesus",
    number: "285",
    title: "《何等朋友我主耶稣》",
    attribution: "诗歌 285 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 13—20 周",
    learning_goal: "F 大调手位、三拍子重心、左手 F/C 根音支撑。",
    source_image: "/materials/hymns/285-what-a-friend-we-have-in-jesus.jpg",
    key_signature: "F 大调（1 = F）",
    tonic_midi: 65,
    time_signature: "3/4",
    beats_per_measure: 3,
    chords: ["F", "C", "F", "C"],
    melody: [
      [1, 3, 5],
      [5, 4, 3],
      [2, 3, 4],
      [3, 2, 1],
    ],
    start_position: "右手 1 指放 F4，保持 F Position；左手准备 F → C 的根音。",
    finger_hint: "F-G-A-B♭-C 对应 1-2-3-4-5；B♭ 用 4 指，不用拇指去够黑键。",
    hand_position: {
      label: "F4 Position",
      start_note: 65,
      intervals: [0, 2, 4, 5, 7],
      applies_to: "三拍子前句旋律在 F4 到 C5 内。",
      reason: "F 大调主音在 F4，五指位能覆盖当前句子，同时保留 4 指处理 B♭ 的习惯。",
    },
  },
  {
    id: "hymn-461-amazing-grace",
    number: "461",
    title: "《奇异恩典何等甘甜》",
    attribution: "诗歌 461 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 16—24 周",
    learning_goal: "G 大调五声音型、弱起感、G/D/Em/C 和弦进行。",
    source_image: "/materials/hymns/461-amazing-grace.jpg",
    key_signature: "G 大调（1 = G）",
    tonic_midi: 67,
    time_signature: "3/4",
    beats_per_measure: 3,
    chords: ["G", "D", "G", "C"],
    melody: [
      [1, 3, 5],
      [5, 3, 2],
      [1, 3, 5],
      [6, 5, 3],
    ],
    start_position: "右手 1 指放 G4；遇到 6（E5）时向 A Position 借位，左手准备 G → D → C。",
    finger_hint: "G-B-D 用 1-3-5 很自然；E5 出现时提前移动，不要用 5 指硬伸。",
    hand_position: {
      label: "G4 Position + A4 Position",
      start_note: 67,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "前句在 G4 到 E5，超过五度时用轻微右移。",
      reason: "这首旋律有向上歌唱的 6 度，手位移动能保持连贯和放松。",
    },
  },
  {
    id: "hymn-036-rock-of-ages",
    number: "36",
    title: "《永久磐石为我开》",
    attribution: "诗歌 36 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 18—24 周",
    learning_goal: "F 大调柱式和弦，句尾长音保持，旋律重音用 2/3/4 指。",
    source_image: "/materials/hymns/036-rock-of-ages.jpg",
    key_signature: "F 大调（1 = F）",
    tonic_midi: 65,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["F", "C", "Dm", "C"],
    melody: [
      [1, 1, 3, 5],
      [4, 3, 2, 1],
      [6, 5, 4, 3],
      [2, 1, 1, 1],
    ],
    start_position: "右手 1 指放 F4；第三小节到 D5 时向 G Position 借位。左手准备 F → C → Dm → C。",
    finger_hint: "F Position 先覆盖 F-G-A-B♭-C；D5 出现前整手右移，句尾再回位。",
    hand_position: {
      label: "F4 Position + G4 Position",
      start_note: 65,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "第三小节超过五指范围，需要提前移动。",
      reason: "先移位再弹高音，可以避免小指紧张，也让句尾回 F 时更稳定。",
    },
  },
  {
    id: "hymn-037-jesus-lover-of-my-soul",
    number: "37",
    title: "《耶稣灵魂的爱人》",
    attribution: "诗歌 37 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 20—26 周",
    learning_goal: "C 大调连线式旋律、下行句保持、左手低音加和弦。",
    source_image: "/materials/hymns/037-jesus-lover-of-my-soul.jpg",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["C", "Am", "F", "G"],
    melody: [
      [5, 5, 6, 5],
      [4, 3, 2, 1],
      [3, 4, 5, 3],
      [2, 1, 1, 1],
    ],
    start_position: "右手先在 C Position；第一小节 6（A4）向 D Position 借位。左手准备 C → Am → F → G。",
    finger_hint: "5-6-5 不要连续用小指伸缩；移动到 D Position 后用 4-5-4 更放松。",
    hand_position: {
      label: "C4 Position + D4 Position",
      start_note: 60,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "第一小节出现 A4，随后回到 C Position。",
      reason: "用手位解释 6 的处理，用户以后看到类似 5-6-5 就知道先看是否需要移位。",
    },
  },
  {
    id: "hymn-200-trust-and-obey",
    number: "200",
    title: "《当我与主同行》",
    attribution: "诗歌 200 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 21—28 周",
    learning_goal: "G 大调行进感、I-V-vi-IV 和弦循环、左手根音持续。",
    source_image: "/materials/hymns/200-trust-and-obey.jpg",
    key_signature: "G 大调（1 = G）",
    tonic_midi: 67,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["G", "D", "Em", "C"],
    melody: [
      [1, 2, 3, 5],
      [5, 4, 3, 2],
      [3, 5, 6, 5],
      [4, 3, 2, 1],
    ],
    start_position: "右手 1 指放 G4；第三小节到 E5 时短暂右移。左手准备 G → D → Em → C。",
    finger_hint: "G-A-B-D 先按 1-2-3-5；E5 出现时不要硬拉，提前向 A Position 移动。",
    hand_position: {
      label: "G4 Position + A4 Position",
      start_note: 67,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "第三小节需要覆盖到 E5。",
      reason: "移动手位让行进式旋律保持均匀，不因为高音打断拍点。",
    },
  },
  {
    id: "hymn-207-all-the-way-my-savior-leads-me",
    number: "207",
    title: "《一路我由救主引领》",
    attribution: "诗歌 207 · 本地歌谱",
    level: "进阶预备",
    recommended_weeks: "第 24—30 周",
    learning_goal: "F 大调长乐句、左手低音加和弦、句尾延长音。",
    source_image: "/materials/hymns/207-all-the-way-my-savior-leads-me.jpg",
    key_signature: "F 大调（1 = F）",
    tonic_midi: 65,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["F", "C", "Dm", "B♭"],
    melody: [
      [3, 4, 5, 6],
      [5, 4, 3, 2],
      [1, 3, 5, 4],
      [3, 2, 1, 1],
    ],
    start_position: "右手以 F Position 开始；第一句到 D5 时向 G Position 借位。左手准备 F → C → Dm → B♭。",
    finger_hint: "B♭ 和 D5 都提示要提前看下一拍；黑键用 2/3/4 指，避免拇指卡住。",
    hand_position: {
      label: "F4 Position + G4 Position",
      start_note: 65,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "长乐句最高到 D5，需要从固定手位过渡到移动手位。",
      reason: "这首适合训练“先看一句最高点”，决定是否提前移动。",
    },
  },
  {
    id: "hymn-247-precious-lord-take-my-hand",
    number: "247",
    title: "《亲爱主握我手》",
    attribution: "诗歌 247 · 本地歌谱",
    level: "进阶预备",
    recommended_weeks: "第 26—32 周",
    learning_goal: "A 小调色彩、弱拍进入、左手 Am/F/G/E 根音。",
    source_image: "/materials/hymns/247-precious-lord-take-my-hand.jpg",
    key_signature: "A 自然小调（1 = A）",
    tonic_midi: 69,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["Am", "F", "G", "E"],
    melody: [
      [1, 3, 2, 1],
      [5, 4, 3, 2],
      [1, 2, 3, 5],
      [4, 3, 2, 1],
    ],
    start_position: "右手 1 指放 A4，保持 A 小调五指位；左手准备 Am → F → G → E。",
    finger_hint: "A-B-C-D-E 对应 1-2-3-4-5；小调 3 是 C5，不要误弹成 C♯。",
    hand_position: {
      label: "A4 Minor Position",
      start_note: 69,
      intervals: [0, 2, 3, 5, 7],
      applies_to: "本教学版保持 A 自然小调五指位。",
      reason: "先建立小调手位，用户能听出 3 音降低带来的色彩。",
    },
  },
  {
    id: "hymn-475-hark-the-herald-angels-sing",
    number: "475",
    title: "《听啊天使高声唱》",
    attribution: "诗歌 475 · 本地歌谱",
    level: "进阶预备",
    recommended_weeks: "第 28—34 周",
    learning_goal: "G 大调上行号角式旋律、D 和弦准备、强拍落键。",
    source_image: "/materials/hymns/475-hark-the-herald-angels-sing.jpg",
    key_signature: "G 大调（1 = G）",
    tonic_midi: 67,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["G", "D", "G", "C"],
    melody: [
      [1, 1, 5, 5],
      [6, 5, 4, 3],
      [2, 3, 4, 5],
      [3, 2, 1, 1],
    ],
    start_position: "右手从 G Position 开始；高音 E5 出现前移到 A Position。左手准备 G → D → G → C。",
    finger_hint: "强拍重复音保持同一手位；上行到 6 时移动，不用小指硬伸。",
    hand_position: {
      label: "G4 Position + A4 Position",
      start_note: 67,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "第二小节出现 E5，需要提前右移。",
      reason: "这类上行号角式旋律要保持手腕放松，手位移动比临时伸展更稳定。",
    },
  },
  {
    id: "hymn-001-great-physician",
    number: "1",
    title: "《至大医生现今可近》",
    attribution: "诗歌 1 · 本地歌谱",
    level: "基础",
    recommended_weeks: "第 30—34 周",
    learning_goal: "C 大调福音诗歌短句，C/G/Am/F 和弦快速辨认。",
    source_image: "/materials/hymns/001-great-physician.jpg",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["C", "G", "Am", "F"],
    melody: [
      [1, 3, 5, 3],
      [5, 6, 5, 4],
      [3, 5, 3, 2],
      [1, 2, 3, 1],
    ],
    start_position: "右手先放 C Position；第二小节 5-6-5-4 建议移到 D Position 后回 C Position。左手准备 C → G → Am → F。",
    finger_hint: "第一小节 1-3-5-3 用 C Position；第二小节整体右移，G-A-G-F 可用 4-5-4-3。",
    hand_position: {
      label: "C4 Position + D4 Position",
      start_note: 60,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "第二小节包含 A4，适合训练“手位移动而不是背指法”。",
      reason: "这首正好对应固定手位到移动手位的教学重点。",
    },
  },
  {
    id: "hymn-496-how-great-thou-art",
    number: "496",
    title: "《主啊我神我每逢举目观看》",
    attribution: "诗歌 496 · 本地歌谱",
    level: "进阶预备",
    recommended_weeks: "第 32—36 周",
    learning_goal: "宽广旋律、G 大调到高音手位、左手低音加和弦。",
    source_image: "/materials/hymns/496-how-great-thou-art.jpg",
    key_signature: "G 大调（1 = G）",
    tonic_midi: 67,
    time_signature: "4/4",
    beats_per_measure: 4,
    chords: ["G", "C", "D", "G"],
    melody: [
      [1, 3, 5, 1],
      [6, 5, 3, 2],
      [4, 5, 6, 5],
      [3, 2, 1, 1],
    ],
    start_position: "右手以 G Position 开始，遇到高音 E5 前移到 A Position。左手准备 G → C → D → G。",
    finger_hint: "宽广旋律先找最高点；E5 不硬够，提前移动后再回主音位。",
    hand_position: {
      label: "G4 Position + A4 Position",
      start_note: 67,
      intervals: [0, 2, 4, 5, 7, 9],
      applies_to: "旋律有宽广上行，适合第 32 周后训练整句预读。",
      reason: "先看最高点再选手位，是后期能自主判断指法的关键。",
    },
  },
];

export const pptx_ooxml_hymn_fallback_entries: hymn_repertoire_entry[] =
  hymn_seeds.map(create_pptx_ooxml_hymn_entry);

export const legacy_hymn_fallback_entries = pptx_ooxml_hymn_fallback_entries;

export const hymn_repertoire_entries = legacy_hymn_fallback_entries;

export const legacy_hymn_fallback_by_number = new Map(
  hymn_seeds.map((seed, index) => [
    normalize_hymn_number(seed.number),
    legacy_hymn_fallback_entries[index],
  ]),
);

export const legacy_hymn_fallback_by_score_id = new Map(
  hymn_seeds.map((seed, index) => [
    `hymn-${normalize_hymn_number(seed.number)}`,
    legacy_hymn_fallback_entries[index],
  ]),
);

export function get_hymn_repertoire_entry(id: string): hymn_repertoire_entry | undefined {
  return hymn_repertoire_entries.find((entry) => entry.id === id);
}

export function normalize_hymn_number(number: string): string {
  return number.padStart(3, "0");
}

function create_pptx_ooxml_hymn_entry(seed: hymn_seed): hymn_repertoire_entry {
  const pptx = hymn_pptx_ooxml_fallback_by_number.get(
    normalize_hymn_number(seed.number),
  );
  if (!pptx) {
    throw new Error(`诗歌 ${seed.number} 缺少 PPTX OOXML fallback。`);
  }

  return {
    id: seed.id,
    title: seed.title,
    attribution: `诗歌 ${pptx.number} · PPTX OOXML 来源`,
    level: seed.level,
    recommended_weeks: seed.recommended_weeks,
    learning_goal:
      `${seed.title} 已从 ${pptx.source_file} 接入 OOXML 来源；当前有 ${pptx.slide_count} 张幻灯片、${pptx.lyric_count} 行歌词，音符事件尚待人工校对发布。`,
    rights_note: hymn_rights_note,
    score: create_pptx_ooxml_hymn_score(seed, pptx),
  };
}

function create_pptx_ooxml_hymn_score(
  seed: hymn_seed,
  pptx: hymn_pptx_ooxml_fallback,
): practice_score {
  return {
    id: seed.id,
    title: `${seed.title} · PPTX OOXML 待审核来源`,
    key_signature: "PPTX OOXML 待审核",
    jianpu_tonic_midi: seed.tonic_midi,
    time_signature:
      pptx.time_signature === "unknown" ? "拍号待审核" : pptx.time_signature,
    beats_per_measure: seed.beats_per_measure,
    tempo_hint: "来源核对模式：等待人工确认拍号、音符事件、手位与指法后再进入跟弹。",
    start_position: `已接入 ${pptx.source_file}；当前只保留 OOXML 来源、歌词与质量状态，不使用旧手写手位。`,
    finger_hint: "PPTX 候选尚未生成可发布逐音指法；请在后台并排校对来源 SVG 与规范谱后发布新版本。",
    finger_guide: create_pptx_ooxml_fingering_guide(pptx),
    source: {
      kind: "reference",
      status: pptx.status,
      label:
        `诗歌 ${pptx.number} PPTX OOXML 来源 · ${pptx.slide_count} 张幻灯片 · ${pptx.lyric_count} 行歌词 · ${pptx.issue_count} 个待审核问题`,
      asset_id: pptx.source_id,
      content_sha256: pptx.source_sha256,
    },
    measure_beats: [],
    measure_beat_units: [],
    steps: [],
  };
}

function create_pptx_ooxml_fingering_guide(
  pptx: hymn_pptx_ooxml_fallback,
): fingering_guide {
  return {
    preparation: [
      `打开 PPTX OOXML 来源：${pptx.source_file}。`,
      `先核对 ${pptx.slide_count} 张幻灯片、${pptx.lyric_count} 行歌词和 SimpMusic 字形问题。`,
      "确认拍号、调号和小节线后，再进入手位、指法与和弦审核。",
    ],
    actions: [
      "不要再使用旧 JPG 或 4 小节手写谱作为判定事实源。",
      "先在后台查看来源忠实 SVG，逐个解决未知字形和结构问题。",
      "发布 ScoreDocument v2 后，课程会自动用已发布版本覆盖这个待审核来源。",
    ],
    success_checks: [
      "能定位来源 PPTX、幻灯片和 shape。",
      "能说明当前为什么还不能进入实时跟弹判定。",
      "发布前所有未知字形、拍号、时值和来源引用都已通过校对。",
    ],
    common_mistakes: [
      "把 OOXML 候选当作已发布练习谱直接用于判错。",
      "用旧手写 4 小节谱覆盖 PPTX 来源事实。",
      "在未知字形未解决时猜测音高或拍号。",
    ],
    position_strategy: [
      "当前没有已发布手位区段；手位必须从校对后的 ScoreDocument v2 生成。",
      "若后台生成了候选手位，只能作为 candidate，不能冒充原谱事实。",
    ],
    fingering_rules: [
      "指法必须来源于已审核 ScoreDocument，或明确标记为 generated/manual。",
      "未知音符事件未解决前，不生成逐音指法判定。",
    ],
    self_check: [
      `来源 SHA-256：${pptx.source_sha256}`,
      `当前事件数：${pptx.event_count}；仍需审核问题：${pptx.issue_count}。`,
      "发布后再把课程绑定到不可变 score_version_id。",
    ],
    position_map: [],
  };
}
