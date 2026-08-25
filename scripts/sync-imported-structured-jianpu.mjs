#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project_root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const import_root = resolve(project_root, "data/jianpu-imported");
const batch_manifest_path = resolve(import_root, "batch-manifest.json");
const output_path = resolve(
  project_root,
  "src/features/repertoire/importedJianpuStructuredData.ts",
);
const temporary_root = mkdtempSync(resolve(tmpdir(), "panio-ccmz-"));

if (!existsSync(batch_manifest_path)) {
  throw new Error(`未找到批处理清单：${batch_manifest_path}`);
}

try {
  const batch_manifest = JSON.parse(readFileSync(batch_manifest_path, "utf8"));
  const results = select_unique_results(batch_manifest.results);
  const entries = [];

  for (const result of results) {
    const manifest_path = resolve(import_root, result.directory, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifest_path, "utf8"));
    const source_url = get_ccmz_url(manifest.target?.src);
    if (!source_url) {
      throw new Error(`未找到 CCMZ 地址：${result.directory}`);
    }

    const archive_path = await download_and_decode(source_url, result.directory);
    const score = read_zip_json(archive_path, "score.json");
    const midi = read_zip_json(archive_path, "midi.json");
    const finger = read_zip_json(archive_path, "finger.json");

    entries.push(build_entry(result, score, midi, finger));
    console.log(`已解析 ${result.title}：${score.parts?.[0]?.measures?.length ?? 0} 小节`);
  }

  writeFileSync(output_path, build_output(entries), "utf8");
  console.log(`已生成完整结构化曲谱：${output_path}`);
} finally {
  rmSync(temporary_root, { recursive: true, force: true });
}

function select_unique_results(results) {
  const selected = [];
  const seen_titles = new Set();

  for (const result of results ?? []) {
    if (result?.error || !Array.isArray(result?.pages) || result.pages.length === 0) {
      continue;
    }

    const parsed = parse_source_title(String(result.title ?? ""));
    if (parsed.title.startsWith("虫虫钢琴")) {
      continue;
    }

    const dedupe_key = parsed.title.toLowerCase();
    if (seen_titles.has(dedupe_key)) {
      continue;
    }

    seen_titles.add(dedupe_key);
    selected.push({
      ...result,
      parsed_title: parsed.title,
      parsed_attribution: parsed.attribution,
    });
  }

  return selected;
}

function parse_source_title(raw_title) {
  const without_site = raw_title.replace(/\s*[-－]虫虫钢琴$/u, "").trim();
  const match = without_site.match(
    /^(?<title>.+?)钢琴简谱\s*数字双手(?:\s+(?<attribution>.+))?$/u,
  );

  if (!match?.groups) {
    return {
      title: cleanup_title(without_site),
      attribution: undefined,
    };
  }

  return {
    title: cleanup_title(match.groups.title),
    attribution: cleanup_attribution(match.groups.attribution),
  };
}

function cleanup_title(value) {
  return String(value ?? "").replaceAll("_", " ").replace(/\s+/gu, " ").trim();
}

function cleanup_attribution(value) {
  const cleaned = String(value ?? "").replaceAll("/", " / ").replace(/\s+/gu, " ").trim();
  return cleaned || undefined;
}

function get_ccmz_url(value) {
  if (!value) {
    return undefined;
  }
  const match = String(value).match(/[?&]url=([^&]+)/u);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function download_and_decode(url, directory) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 CCMZ 失败：${response.status} ${url}`);
  }

  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw[0] !== 2) {
    throw new Error(`暂不支持 CCMZ 版本：${raw[0]}（${directory}）`);
  }

  const decoded = Buffer.from(
    raw.slice(1).map((value) => (value % 2 === 0 ? value + 1 : value - 1)),
  );
  const archive_path = resolve(
    temporary_root,
    `${directory.replaceAll("/", "_")}.zip`,
  );
  writeFileSync(archive_path, decoded);
  return archive_path;
}

function read_zip_json(archive_path, file_name) {
  const json = execFileSync("unzip", ["-p", archive_path, file_name], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(json);
}

function build_entry(result, score, midi, finger) {
  const measures = score.parts?.[0]?.measures ?? [];
  const midi_measure_map = new Map(
    Object.values(midi.measures ?? {}).map((measure) => [measure.measure, measure]),
  );
  const midi_measure_starts = new Map(
    Object.entries(midi.measures ?? {}).map(([start, measure]) => [
      measure.measure,
      Number(start),
    ]),
  );
  const measure_beats = measures.map((measure, index) =>
    measure.time?.beats ??
    midi.measureInfos?.[index]?.beats ??
    4);
  const measure_beat_units = measures.map((measure, index) =>
    measure.time?.beatu ??
    midi.measureInfos?.[index]?.beatUnit ??
    4);
  const note_events = (midi.events ?? [])
    .filter((event) =>
      event.event?.[0] === 144 &&
      Number(event.event?.[2] ?? 0) > 0 &&
      Number.isInteger(event.measure));
  const fingering_by_id = collect_fingerings(finger);
  const tonic_midi = get_tonic_midi(score.fifths ?? 0);
  const source_measures = measures.map((measure, measure_index) => {
    const midi_measure = midi_measure_map.get(measure_index);
    const measure_ticks = measure.ticks ??
      midi_measure?.duration ??
      (measure_beats[measure_index] * 480);
    const ticks_per_beat = measure_ticks / measure_beats[measure_index];
    const events = note_events
      .filter((event) => event.measure === measure_index)
      .map((event) => ({
        ...event,
        onset_ticks: event.tick - event.meas_start_tick,
        hand: event.track === midi.rightHandTrack ? "right" : "left",
      }));

    return build_measure(
      events,
      measure_ticks,
      ticks_per_beat,
      tonic_midi,
      fingering_by_id,
    );
  });
  extend_cross_measure_holds(
    source_measures,
    note_events,
    midi_measure_starts,
    measure_beats,
  );

  const title = `《${result.parsed_title}》`;
  const page_directory = String(result.directory);
  const preview_url = make_public_url(page_directory, result.pages[0].file);

  return {
    id: `imported-${String(result.source_url).match(/\/(\d+)\.htm$/u)?.[1] ?? result.parsed_title}`,
    title,
    attribution: result.parsed_attribution ?? "原站标题未标注作者",
    source_url: String(result.source_url),
    directory: page_directory,
    page_count: result.pages.length,
    preview_image: {
      url: preview_url,
      alt: `${title} 整首结构化谱源图`,
      width: result.pages[0].width ?? 483,
      height: result.pages[0].height ?? 680,
    },
    measure_count: measures.length,
    measure_beats,
    measure_beat_units,
    time_signature: `${measure_beats[0]}/${measure_beat_units[0]}`,
    tonic_midi,
    key_signature: `${get_key_name(score.fifths ?? 0)} 调（1 = ${get_key_name(score.fifths ?? 0)}）`,
    tempo_bpm: Math.round(60_000_000 / Number(midi.tempos?.[0]?.tempo ?? 600_000)),
    measures: source_measures,
    rights_note: "该条目已进入授权教学版，当前已根据原始 CCMZ 数据整理为整首结构化教学谱；原谱页图保留用于来源对照。",
  };
}

function extend_cross_measure_holds(
  source_measures,
  note_events,
  midi_measure_starts,
  measure_beats,
) {
  for (let measure_index = 1; measure_index < source_measures.length; measure_index += 1) {
    if (source_measures[measure_index].length > 0) {
      continue;
    }

    const measure_start = midi_measure_starts.get(measure_index) ?? 0;
    const has_active_note = note_events.some((event) =>
      event.tick < measure_start &&
      event.tick + Number(event.duration ?? 0) > measure_start);
    const previous_measure = source_measures[measure_index - 1];
    if (!has_active_note || previous_measure.length === 0) {
      continue;
    }

    const last_seed = previous_measure.at(-1);
    last_seed.duration_beats += measure_beats[measure_index];
    last_seed.allow_cross_measure = true;
  }
}

function build_measure(
  events,
  measure_ticks,
  ticks_per_beat,
  tonic_midi,
  fingering_by_id,
) {
  const by_onset = new Map();
  for (const event of events) {
    const onset = Math.max(0, Math.round(event.onset_ticks));
    const group = by_onset.get(onset) ?? [];
    group.push(event);
    by_onset.set(onset, group);
  }

  const onsets = [...by_onset.keys()].sort((left, right) => left - right);
  return onsets.map((onset, index) => {
    const next_onset = onsets[index + 1] ?? measure_ticks;
    const duration_ticks = Math.max(1, next_onset - onset);
    const group = by_onset.get(onset) ?? [];
    const right_events = group
      .filter((event) => event.hand === "right")
      .sort((left, right) => left.event[1] - right.event[1]);
    const left_events = group
      .filter((event) => event.hand === "left")
      .sort((left, right) => left.event[1] - right.event[1]);
    const right_notes = right_events.map((event) => event.event[1]);
    const left_notes = left_events.map((event) => event.event[1]);
    const active_hands = ["right", "left"].filter((hand) =>
      !group.some((event) => event.hand === hand) &&
      events.some((event) =>
        event.hand === hand &&
        event.tick < (group[0]?.tick ?? 0) &&
        event.tick + Number(event.duration ?? 0) > (group[0]?.tick ?? 0)));
    const hand = right_notes.length > 0 && left_notes.length > 0
      ? "both"
      : right_notes.length > 0
        ? "right"
        : "left";
    const ordered_events = [...left_events, ...right_events];
    const notes = ordered_events.map((event) => event.event[1]);
    const fingerings = ordered_events
      .map((event) => {
        const finger = fingering_by_id.get(event.id);
        if (!finger) {
          return undefined;
        }
        return {
          note: event.event[1],
          finger,
          hand: event.hand,
          source: "score",
        };
      })
      .filter(Boolean);
    const notation = [
      left_notes.map((note) => format_jianpu(note, tonic_midi)).join("+"),
      right_notes.map((note) => format_jianpu(note, tonic_midi)).join("+"),
    ].filter(Boolean).join(" / ");

    return {
      onset_beats: onset / ticks_per_beat,
      notation: notation || "休止",
      notes,
      hand,
      duration_beats: duration_ticks / ticks_per_beat,
      held_hands: active_hands.length > 0 ? active_hands : undefined,
      fingerings: fingerings.length > 0 ? fingerings : undefined,
    };
  });
}

function collect_fingerings(finger) {
  const result = new Map();
  for (const measure of finger.parts?.[0]?.measures ?? []) {
    for (const note of measure.notes ?? []) {
      const values = note.arts
        ?.filter((art) => art.type === "fingering")
        .map((art) => Number(art.val))
        .filter((candidate) => candidate >= 1 && candidate <= 5) ?? [];
      for (const [element_index, element] of (note.elems ?? []).entries()) {
        const value = values[element_index] ?? (values.length === 1 ? values[0] : undefined);
        if (value) {
          result.set(element.id, value);
        }
      }
    }
  }
  return result;
}

function format_jianpu(midi, tonic_midi) {
  const chromatic = [
    ["1", ""], ["1", "♯"], ["2", ""], ["2", "♯"],
    ["3", ""], ["4", ""], ["4", "♯"], ["5", ""],
    ["5", "♯"], ["6", ""], ["6", "♯"], ["7", ""],
  ];
  const interval = ((midi - tonic_midi) % 12 + 12) % 12;
  const [degree, accidental] = chromatic[interval];
  const octave_offset = Math.floor((midi - tonic_midi) / 12);
  const octave = octave_offset > 0
    ? "高".repeat(octave_offset)
    : octave_offset < 0
      ? "低".repeat(Math.abs(octave_offset))
      : "";
  return `${accidental}${degree}${octave}`;
}

function get_key_name(fifths) {
  const names = new Map([
    [-7, "C♭"], [-6, "G♭"], [-5, "D♭"], [-4, "A♭"],
    [-3, "E♭"], [-2, "B♭"], [-1, "F"], [0, "C"],
    [1, "G"], [2, "D"], [3, "A"], [4, "E"],
    [5, "B"], [6, "F♯"], [7, "C♯"],
  ]);
  return names.get(fifths) ?? "C";
}

function get_tonic_midi(fifths) {
  const tonics = new Map([
    [-7, 59], [-6, 66], [-5, 61], [-4, 68],
    [-3, 63], [-2, 70], [-1, 65], [0, 60],
    [1, 67], [2, 62], [3, 69], [4, 64],
    [5, 59], [6, 66], [7, 61],
  ]);
  return tonics.get(fifths) ?? 60;
}

function make_public_url(directory, file) {
  return `/materials/jianpu-imported/${encodeURIComponent(directory)}/${encodeURIComponent(file)}`;
}

function build_output(entries) {
  return `/* This file is generated by scripts/sync-imported-structured-jianpu.mjs. */

import type { note_seed } from "@/features/course/scoreBuilders";

export interface imported_jianpu_structured_entry {
  id: string;
  title: string;
  attribution: string;
  source_url: string;
  directory: string;
  page_count: number;
  preview_image: {
    url: string;
    alt: string;
    width: number;
    height: number;
  };
  measure_count: number;
  measure_beats: number[];
  measure_beat_units: number[];
  time_signature: string;
  tonic_midi: number;
  key_signature: string;
  tempo_bpm: number;
  measures: note_seed[][];
  rights_note: string;
}

export const imported_jianpu_structured_entries: imported_jianpu_structured_entry[] = ${JSON.stringify(entries, null, 2)};
`;
}
