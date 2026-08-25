import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const project_root = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

export const hymn_pptx_input_root = resolve(project_root, "712首-文字");

export const readonly_pptx_fixtures = Object.freeze([
  Object.freeze({
    hymn_id: "001",
    file_name: "001 至大医生.pptx",
    sha256: "1b58f043d0fefe0a1d89f3eacc4906d1239ea838cccec201bd8cb94c3c5797d3",
    slide_count: 7,
    font_profile: "base",
  }),
  Object.freeze({
    hymn_id: "002",
    file_name: "002 离弃宝座撇下王冕.pptx",
    sha256: "76d11dc6f3f4f346d81e516f2b456280a2bf9214ed49fa3d12d797ca91ebfa5a",
    slide_count: 5,
    font_profile: "base_accent",
  }),
  Object.freeze({
    hymn_id: "060",
    file_name: "060 乐哉白白恩典.pptx",
    sha256: "e31521b3d63bc339ef3793fa45aa7f7d27ca8fa1bca69dc8c3b82a5c992de195",
    slide_count: 4,
    font_profile: "no_simpmusic",
  }),
]);
