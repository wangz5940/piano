import type {
  material_catalog,
  material_fingering_annotation,
  material_segment,
} from "./types";

interface score_source_like {
  asset_id?: string;
  source_page?: number;
  excerpts?: Array<{ asset_id: string }>;
}

const beyer_touch_fingering: material_fingering_annotation = {
  summary: "原谱第 1—24 条使用 1—5 标明手指编号，重点练习贴键换指。",
  source_pages: [7, 8, 9],
  limitation: "现有 MusicXML 没有逐音 <fingering> 标签；这里接入的是原谱文字说明和课程已人工确认的手指编号规则。",
  rules: [
    {
      id: "beyer-finger-numbering",
      label: "1—5 指编号",
      text: "两只手都按拇指 1、食指 2、中指 3、无名指 4、小指 5 来读谱上数字。",
      source: "manual_mapping",
      scope: "触键练习第 1—24 条",
      hand: "both",
      fingers: [1, 2, 3, 4, 5],
    },
    {
      id: "beyer-finger-exchange",
      label: "换指动作",
      text: "每当一个手指触键时，其前一手指应立即抬起，这一起一落须在同时。",
      source: "ocr_text",
      scope: "拜厄原谱手指触键练习说明",
      hand: "both",
    },
    {
      id: "beyer-not-solfege",
      label: "数字不是简谱音级",
      text: "谱面上靠近音符的 1—5 是手指编号，不是简谱 1—5；必须先说出手指，再落键。",
      source: "manual_mapping",
      scope: "零基础读谱提醒",
      hand: "both",
      fingers: [1, 2, 3, 4, 5],
    },
  ],
};

const beyer_legato_fingering: material_fingering_annotation = {
  summary: "三手练习页强调连奏：下一个手指落下后，原来按住的手指才离键。",
  source_pages: [11, 12, 13],
  limitation: "现有 MusicXML 未保留逐音指法数字；这里接入的是原谱文字说明。",
  rules: [
    {
      id: "beyer-legato-exchange",
      label: "连奏换指",
      text: "已经按在琴键上的手指，要在下一个手指弹下去时才抬起来。",
      source: "ocr_text",
      scope: "三手练习连线说明",
      hand: "right",
    },
    {
      id: "beyer-repeated-note",
      label: "同指重复音",
      text: "同一手指需两次或多次弹击同一琴键时，每次都必须把手抬起来再弹。",
      source: "ocr_text",
      scope: "三手练习连奏说明",
      hand: "right",
    },
  ],
};

const beyer_hand_position_fingering: material_fingering_annotation = {
  summary: "四手练习学生声部按“手的位置”图安排指法。",
  source_pages: [19],
  limitation: "原谱说明给出手位和指法原则，但现有 MusicXML 没有逐音指法标签；跟弹仍以音高和节拍判定。",
  rules: [
    {
      id: "beyer-hand-position",
      label: "按手位安排指法",
      text: "指法按手指的位置来安排：先摆好两手拇指位置，再让其余手指对准相邻琴键。",
      source: "ocr_text",
      scope: "拜厄原谱第 19 页四手练习学生高音声部",
      hand: "both",
      fingers: [1, 2, 3, 4, 5],
    },
  ],
};

const hanon_part_one_fingering: material_fingering_annotation = {
  summary: "哈农第一部分用数字标出重点训练手指，弹奏时每个音都要清晰、均匀。",
  source_pages: [6, 7],
  limitation: "这些数字来自 OCR 识别的教材说明和练习标签，不是 OMR 自动恢复的逐音指法；使用前仍需对照原谱。",
  rules: [
    {
      id: "hanon-focused-fingers",
      label: "重点手指数字",
      text: "为简明起见，以后每条练习中重点训练的手指均用数字表示。",
      source: "ocr_text",
      scope: "哈农第一部分准备练习说明",
      hand: "both",
      fingers: [1, 2, 3, 4, 5],
    },
    {
      id: "hanon-lift-clearly",
      label: "抬指与清晰触键",
      text: "高高地并正确地抬起手指，每个音符都要弹得很清晰。",
      source: "ocr_text",
      scope: "哈农第一部分总说明",
      hand: "both",
    },
    {
      id: "hanon-exercise-one-34",
      label: "练习一补充组合",
      text: "（3-4）弹熟这一练习后，再弹前一练习，并把两者连续不断地连奏四遍。",
      source: "ocr_text",
      scope: "哈农练习一页下注释",
      hand: "both",
      fingers: [3, 4],
    },
  ],
};

const hanon_all_fingers_fingering: material_fingering_annotation = {
  summary: "本页明确出现（1-2-3-4-5），用于五个手指的均衡练习。",
  source_pages: [10, 11, 12],
  limitation: "括号数字是教材文字说明中的手指组合；现有 MusicXML 没有逐音指法标签。",
  rules: [
    {
      id: "hanon-12345",
      label: "五指组合",
      text: "（1-2-3-4-5）表示五个手指都要参与，练到均匀清晰后再提高速度。",
      source: "ocr_text",
      scope: "哈农第一部分五指练习说明",
      hand: "both",
      fingers: [1, 2, 3, 4, 5],
    },
  ],
};

const hanon_part_two_fingering: material_fingering_annotation = {
  summary: "第二部分说明每小节特定拍点的 3、4、5 指进行。",
  source_pages: [32],
  limitation: "这是教材文字中的练习重点说明，不是逐音自动指法。",
  rules: [
    {
      id: "hanon-part-two-345",
      label: "3、4、5 指进行",
      text: "每一小节第一拍左手第 3、4、5 各指的进行，在同一小节第三拍上右手以同样手指做反向进行。",
      source: "ocr_text",
      scope: "哈农练习二十一说明",
      hand: "both",
      fingers: [3, 4, 5],
    },
  ],
};

const explicit_annotations: Record<string, material_fingering_annotation> = {
  "beyer.segment.001": beyer_touch_fingering,
  "beyer.segment.002": beyer_legato_fingering,
  "beyer.segment.023": beyer_hand_position_fingering,
  "hanon.segment.001": hanon_part_one_fingering,
  "hanon.segment.005": hanon_all_fingers_fingering,
  "hanon.segment.008": hanon_all_fingers_fingering,
  "hanon.segment.021": hanon_part_two_fingering,
  "hanon.segment.029": {
    ...hanon_all_fingers_fingering,
    summary: "练习二十九说明（1-2-3-4-5）是五个手指弹奏颤音的预备练习。",
    rules: [{
      id: "hanon-trill-12345",
      label: "五指颤音预备",
      text: "（1-2-3-4-5）为五个手指弹奏颤音做的预备练习。",
      source: "ocr_text",
      scope: "哈农练习二十九说明",
      hand: "both",
      fingers: [1, 2, 3, 4, 5],
    }],
  },
};

export function apply_material_fingering_annotations(
  catalog: material_catalog,
): material_catalog {
  return {
    ...catalog,
    materials: catalog.materials.map((material) => ({
      ...material,
      segments: material.segments.map((segment) => ({
        ...segment,
        fingering: get_material_fingering_annotation(segment),
      })),
    })),
  };
}

export function get_material_fingering_annotation(
  segment: Pick<
    material_segment,
    "id" | "material_id" | "source_pages" | "ocr_exercise_numbers" | "fingering_candidates_url"
  >,
): material_fingering_annotation | undefined {
  const explicit = explicit_annotations[segment.id];
  if (explicit) {
    return explicit;
  }

  if (segment.material_id === "beyer") {
    if (has_any_page(segment.source_pages, [7, 8, 9])) {
      return beyer_touch_fingering;
    }
    if (has_any_page(segment.source_pages, [11, 12, 13])) {
      return beyer_legato_fingering;
    }
    if (segment.source_pages.includes(19)) {
      return beyer_hand_position_fingering;
    }
  }

  if (segment.material_id === "hanon") {
    if (segment.ocr_exercise_numbers.some((number) => number >= 1 && number <= 20)) {
      return hanon_part_one_fingering;
    }
    if (segment.ocr_exercise_numbers.some((number) => number >= 21 && number <= 30)) {
      return hanon_part_two_fingering;
    }
  }

  if (segment.fingering_candidates_url) {
    return {
      summary: "已生成 OCR 指法候选，使用前需要对照原谱人工核对。",
      source_pages: segment.source_pages,
      limitation: "候选来自普通文字 OCR 的 1—5 数字和教材文字说明，不是已确认的逐音指法。",
      rules: [
        {
          id: `${segment.id}-fingering-candidates`,
          label: "指法候选文件",
          text: `候选地址：${segment.fingering_candidates_url}`,
          source: "ocr_text",
          scope: "OCR 指法候选",
          hand: "both",
          fingers: [1, 2, 3, 4, 5],
        },
      ],
    };
  }

  return undefined;
}

export function get_source_fingering_annotations(
  source: score_source_like,
): material_fingering_annotation[] {
  const asset_ids = source.excerpts?.length
    ? source.excerpts.map((excerpt) => excerpt.asset_id)
    : source.asset_id
      ? [source.asset_id]
      : [];
  const annotations = asset_ids
    .map((asset_id) => explicit_annotations[asset_id])
    .filter((annotation): annotation is material_fingering_annotation => Boolean(annotation));

  if (annotations.length === 0 && source.source_page !== undefined) {
    if (source.source_page >= 7 && source.source_page <= 9) {
      annotations.push(beyer_touch_fingering);
    } else if (source.source_page >= 11 && source.source_page <= 13) {
      annotations.push(beyer_legato_fingering);
    } else if (source.source_page === 19) {
      annotations.push(beyer_hand_position_fingering);
    }
  }

  return dedupe_annotations(annotations);
}

function dedupe_annotations(
  annotations: material_fingering_annotation[],
): material_fingering_annotation[] {
  const seen = new Set<string>();
  return annotations.filter((annotation) => {
    if (seen.has(annotation.summary)) {
      return false;
    }
    seen.add(annotation.summary);
    return true;
  });
}

function has_any_page(source_pages: number[], pages: number[]): boolean {
  return pages.some((page) => source_pages.includes(page));
}
