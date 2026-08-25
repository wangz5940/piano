import type { practice_score } from "./types";
import {
  both_hands_seed,
  left_hand_seed,
  make_piece_steps,
  right_hand_seed,
  type note_seed,
} from "./scoreBuilders";

const twinkle_source_right_measures: note_seed[][] = [
  [right_hand_seed("1", 60, 1), right_hand_seed("1", 60, 1)],
  [right_hand_seed("5", 67, 4), right_hand_seed("5", 67, 4)],
  [right_hand_seed("6", 69, 5), right_hand_seed("6", 69, 5)],
  [right_hand_seed("5", 67, 4, 2)],
  [right_hand_seed("4", 65, 3), right_hand_seed("4", 65, 4)],
  [right_hand_seed("3", 64, 3), right_hand_seed("3", 64, 3)],
  [right_hand_seed("2", 62, 2), right_hand_seed("2", 62, 2)],
  [right_hand_seed("1", 60, 1, 2)],
  [right_hand_seed("5", 67, 5), right_hand_seed("5", 67, 5)],
  [right_hand_seed("4", 65, 4), right_hand_seed("4", 65, 4)],
  [right_hand_seed("3", 64, 3), right_hand_seed("3", 64, 3)],
  [right_hand_seed("2", 62, 2, 2)],
  [right_hand_seed("5", 67, 5), right_hand_seed("5", 67, 5)],
  [right_hand_seed("4", 65, 4), right_hand_seed("4", 65, 4)],
  [right_hand_seed("3", 64, 3), right_hand_seed("3", 64, 3)],
  [right_hand_seed("2", 62, 2, 2)],
  [right_hand_seed("1", 60, 1), right_hand_seed("1", 60, 1)],
  [right_hand_seed("5", 67, 4), right_hand_seed("5", 67, 4)],
  [right_hand_seed("6", 69, 5), right_hand_seed("6", 69, 5)],
  [right_hand_seed("5", 67, 4, 2)],
  [right_hand_seed("4", 65, 3), right_hand_seed("4", 65, 4)],
  [right_hand_seed("3", 64, 3), right_hand_seed("3", 64, 3)],
  [right_hand_seed("2", 62, 2), right_hand_seed("2", 62, 2)],
  [right_hand_seed("1", 60, 1, 2)],
];

const twinkle_source_both_measures: note_seed[][] = [
  [
    both_hands_seed("右 1 + 左 1+5", [60, 1], [[48, 5], [55, 1]]),
    both_hands_seed("右 1 + 左 3+5", [60, 1], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 5 + 左 1+5", [67, 4], [[48, 5], [55, 1]]),
    both_hands_seed("右 5 + 左 3+5", [67, 4], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 6 + 左 1+6", [69, 5], [[48, 5], [57, 1]]),
    both_hands_seed("右 6 + 左 4+6", [69, 5], [[53, 2], [57, 1]]),
  ],
  [
    both_hands_seed("右 5 + 左 1+5", [67, 4], [[48, 5], [55, 1]]),
    left_hand_seed("左 3+5，右保持 5", [[52, 3], [55, 1]], 1, ["right"]),
  ],
  [
    both_hands_seed("右 4 + 左 1+6", [65, 3], [[48, 5], [57, 1]]),
    both_hands_seed("右 4 + 左 4+6", [65, 4], [[53, 2], [57, 1]]),
  ],
  [
    both_hands_seed("右 3 + 左 1+5", [64, 3], [[48, 5], [55, 1]]),
    both_hands_seed("右 3 + 左 3+5", [64, 3], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 2 + 左 7+5", [62, 2], [[47, 5], [55, 1]]),
    both_hands_seed("右 2 + 左 2+5", [62, 2], [[50, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 1 + 左 1+5", [60, 1], [[48, 5], [55, 1]]),
    left_hand_seed("左 3+5，右保持 1", [[52, 3], [55, 1]], 1, ["right"]),
  ],
  [
    both_hands_seed("右 5 + 左 1+5", [67, 5], [[48, 5], [55, 1]]),
    both_hands_seed("右 5 + 左 3+5", [67, 5], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 4 + 左 1+6", [65, 4], [[48, 5], [57, 1]]),
    both_hands_seed("右 4 + 左 4+6", [65, 4], [[53, 2], [57, 1]]),
  ],
  [
    both_hands_seed("右 3 + 左 1+5", [64, 3], [[48, 5], [55, 1]]),
    both_hands_seed("右 3 + 左 3+5", [64, 3], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 2 + 左 7+5", [62, 2], [[47, 5], [55, 1]]),
    left_hand_seed("左 2+5，右保持 2", [[50, 3], [55, 1]], 1, ["right"]),
  ],
  [
    both_hands_seed("右 5 + 左 1+5", [67, 5], [[48, 5], [55, 1]]),
    both_hands_seed("右 5 + 左 3+5", [67, 5], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 4 + 左 1+6", [65, 4], [[48, 5], [57, 1]]),
    both_hands_seed("右 4 + 左 4+6", [65, 4], [[53, 2], [57, 1]]),
  ],
  [
    both_hands_seed("右 3 + 左 1+5", [64, 3], [[48, 5], [55, 1]]),
    both_hands_seed("右 3 + 左 3+5", [64, 3], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 2 + 左 7+5", [62, 2], [[47, 5], [55, 1]]),
    left_hand_seed("左 2+5，右保持 2", [[50, 3], [55, 1]], 1, ["right"]),
  ],
  [
    both_hands_seed("右 1 + 左 1+5", [60, 1], [[48, 5], [55, 1]]),
    both_hands_seed("右 1 + 左 3+5", [60, 1], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 5 + 左 1+5", [67, 4], [[48, 5], [55, 1]]),
    both_hands_seed("右 5 + 左 3+5", [67, 4], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 6 + 左 1+6", [69, 5], [[48, 5], [57, 1]]),
    both_hands_seed("右 6 + 左 4+6", [69, 5], [[53, 2], [57, 1]]),
  ],
  [
    both_hands_seed("右 5 + 左 1+5", [67, 4], [[48, 5], [55, 1]]),
    left_hand_seed("左 3+5，右保持 5", [[52, 3], [55, 1]], 1, ["right"]),
  ],
  [
    both_hands_seed("右 4 + 左 1+6", [65, 3], [[48, 5], [57, 1]]),
    both_hands_seed("右 4 + 左 4+6", [65, 4], [[53, 2], [57, 1]]),
  ],
  [
    both_hands_seed("右 3 + 左 1+5", [64, 3], [[48, 5], [55, 1]]),
    both_hands_seed("右 3 + 左 3+5", [64, 3], [[52, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 2 + 左 7+5", [62, 2], [[47, 5], [55, 1]]),
    both_hands_seed("右 2 + 左 2+5", [62, 2], [[50, 3], [55, 1]]),
  ],
  [
    both_hands_seed("右 1 + 左 1", [60, 1], [[48, 5]], 2),
  ],
];

export const twinkle_source_reference_image = {
  url: "/materials/repertoire/twinkle-source.png",
  alt: "《小星星》简谱源图，包含双行简谱与圈号指法",
  title: "《小星星》源简谱",
  caption: "当前交互谱与课程拆分均以这张《小星星》简谱 PNG 为源数据，便于对照原始分句、拍号与圈号指法。",
} as const satisfies NonNullable<practice_score["source"]["reference_image"]>;

export const twinkle_complete_right = make_piece_steps(
  "twinkle-complete-right",
  2,
  twinkle_source_right_measures,
);

export const twinkle_complete_source_both = make_piece_steps(
  "twinkle-complete-source-both",
  2,
  twinkle_source_both_measures,
);

export const twinkle_right = make_piece_steps(
  "twinkle-right",
  2,
  twinkle_source_right_measures.slice(0, 8),
);
