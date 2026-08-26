#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  parse_musicxml_to_score_document,
} from "../src/features/calibration/musicxml.ts";
import {
  synchronize_project_notation_metadata,
} from "../src/features/calibration/notationSync.ts";
import {
  validate_calibration_project,
} from "../src/features/calibration/validation.ts";
import type {
  calibration_project,
  calibration_validation_result,
} from "../src/features/calibration/types.ts";
import { infer_note_fingerings } from "../src/features/course/fingerings.ts";
import type {
  jianpu_catalog,
  jianpu_material,
  jianpu_segment,
} from "../src/features/jianpu/types.ts";
import type { score_document } from "../src/features/score/index.ts";

import {
  score_document_to_jianpu_score,
} from "../server/app.mjs";
import { open_database } from "../server/database.mjs";
import {
  validate_score_calibration_save,
} from "../server/validation.mjs";

interface material_catalog_segment {
  id: string;
  sequence: number;
  title: string;
  musicxml_url: string;
  sha256: string;
  derived_assets?: {
    practice_events_url?: string;
  };
}

interface material_catalog {
  materials: Array<{
    id: string;
    segments: material_catalog_segment[];
  }>;
}

interface existing_calibration_row {
  segment_id: string;
  project_json: string;
  document_json: string;
  event_metadata_json: string;
}

interface prepared_calibration {
  segment: jianpu_segment;
  project: calibration_project;
  validation: calibration_validation_result;
  jianpu_path: string;
  jianpu_json: string;
  practice_path?: string;
  practice_json?: string;
  preserved_manual: boolean;
  repairs: {
    meter_extensions: number;
    orphan_ties_removed: number;
  };
}

const project_root = resolve(import.meta.dirname, "..");
const materials_root = resolve(project_root, "public/materials");
const database_path = resolve(project_root, "data/panio.sqlite");
const jianpu_catalog_path = resolve(materials_root, "jianpu-catalog.json");
const material_catalog_path = resolve(materials_root, "catalog.json");
const source_musicxml_root = resolve(
  project_root,
  ".trae/documents/拜厄钢琴基本教程_MusicXML",
);
const report_path = resolve(
  project_root,
  ".trae/documents/拜厄钢琴基本教程_批量校准报告.md",
);
const should_write = process.argv.includes("--write");
const selected_sequence = process.argv
  .find((argument) => argument.startsWith("--segment="))
  ?.split("=")[1];
const generated_reason =
  "依据已人工校准的拜厄固定手位规则生成；保留人工样本中的换位例外。";

const jianpu_catalog = read_json<jianpu_catalog>(jianpu_catalog_path);
const material_catalog = read_json<material_catalog>(material_catalog_path);
const material = get_beyer_material(jianpu_catalog);
const catalog_material = material_catalog.materials.find((item) => item.id === "beyer");
if (!catalog_material) {
  throw new Error("catalog.json 中未找到拜厄教材。");
}

const catalog_segment_by_id = new Map(
  catalog_material.segments.map((segment) => [segment.id, segment]),
);
const existing_by_segment = load_existing_calibrations(database_path);
const selected_segments = selected_sequence
  ? material.segments.filter((segment) =>
      String(segment.sequence).padStart(3, "0") === selected_sequence.padStart(3, "0"))
  : material.segments;
const prepared = selected_segments.map((segment) =>
  prepare_segment(
    material,
    segment,
    catalog_segment_by_id.get(segment.id),
    existing_by_segment.get(segment.id),
  ));

const report = build_report(prepared);
console.log(report.summary);

if (should_write) {
  write_all(prepared);
  atomic_write(report_path, report.markdown);
  console.log(`校准结果已写入，报告：${report_path}`);
} else {
  console.log(report.markdown);
  console.log("当前为审计模式；确认后使用 --write 写入。");
}

function prepare_segment(
  material: jianpu_material,
  segment: jianpu_segment,
  catalog_segment: material_catalog_segment | undefined,
  existing: existing_calibration_row | undefined,
): prepared_calibration {
  if (!catalog_segment) {
    throw new Error(`catalog.json 缺少片段：${segment.id}`);
  }
  const source_path = resolve(
    source_musicxml_root,
    `拜厄钢琴基本教程_乐章_${String(segment.sequence).padStart(3, "0")}.musicxml`,
  );
  const source_xml = readFileSync(source_path, "utf8");
  const source_sha256 = sha256(source_xml);
  if (source_sha256 !== catalog_segment.sha256) {
    throw new Error(
      `${segment.id} 原始 MusicXML 哈希与目录不一致：${source_sha256}`,
    );
  }
  const jianpu_path = resolve(
    materials_root,
    segment.jianpu_url.replace(/^\/+materials\//u, ""),
  );
  const existing_jianpu = read_json<Record<string, unknown>>(jianpu_path);

  const preserved_manual =
    existing !== undefined && !is_batch_generated(existing);
  const project = preserved_manual
    ? restore_existing_project(existing!)
    : create_generated_project(
        material,
        segment,
        source_xml,
        source_sha256,
      );
  preserve_project_hands(project.document, existing_jianpu);
  synchronize_project_notation_metadata(project);
  const repairs = preserved_manual
    ? { meter_extensions: 0, orphan_ties_removed: 0 }
    : repair_structural_issues(project);
  const validation = validate_calibration_project(project);
  const jianpu_score = score_document_to_jianpu_score(
    project.document,
    segment.id,
  );
  preserve_jianpu_chords(jianpu_score, existing_jianpu);
  const practice_path = catalog_segment.derived_assets?.practice_events_url
    ? resolve(
        materials_root,
        catalog_segment.derived_assets.practice_events_url.replace(
          /^\/+materials\//u,
          "",
        ),
      )
    : undefined;
  const practice_json = practice_path
    ? JSON.stringify(
        add_practice_fingerings(
          read_json<Record<string, unknown>>(practice_path),
          project.document,
        ),
        null,
        2,
      ) + "\n"
    : undefined;

  return {
    segment,
    project,
    validation,
    jianpu_path,
    jianpu_json: `${JSON.stringify(jianpu_score)}\n`,
    practice_path,
    practice_json,
    preserved_manual,
    repairs,
  };
}

function create_generated_project(
  material: jianpu_material,
  segment: jianpu_segment,
  source_xml: string,
  source_sha256: string,
): calibration_project {
  const now = new Date().toISOString();
  const title = segment.title.startsWith(material.title)
    ? segment.title
    : `${material.title} · ${segment.title}`;
  const imported = parse_musicxml_to_score_document(
    source_xml,
    {
      composer: "Ferdinand Beyer",
      opus: String(segment.sequence),
      edition: material.title,
      publisher: "",
      source: segment.source_page_label,
    },
    {
      id: `score-beyer-${segment.id}`,
      source_file: segment.musicxml_url,
    },
  );
  const document = imported.document;
  document.number = String(segment.sequence);
  document.title = title;
  document.status = "published";
  document.provenance = {
    kind: "manual",
    source_id: segment.id,
    source_file: segment.musicxml_url,
    source_sha256,
    font_config_version: null,
    importer_version: "beyer-batch-calibration/v1",
    references: [],
  };
  document.review = {
    reviewed_by: null,
    reviewed_at: null,
    published_by: "beyer-batch-calibration",
    published_at: now,
    note: "OMR 结构校验后，依据人工样本规则生成逐音指法。",
  };
  apply_generated_fingerings(document);

  const project: calibration_project = {
    schema_version: 1,
    id: `material:beyer:${segment.id}`,
    title,
    work: {
      composer: "Ferdinand Beyer",
      opus: String(segment.sequence),
      edition: material.title,
      publisher: "",
      source: segment.source_page_label,
    },
    source: {
      file_name: segment.musicxml_url,
      mime_type: "application/vnd.recordare.musicxml+xml",
      page_count: material.page_count,
      attached_at: now,
    },
    material_catalog: {
      material_id: material.id,
      title: material.title,
      chapters: material.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        description: chapter.description,
        page_start: chapter.page_start,
        page_end: chapter.page_end,
      })),
    },
    musicxml: null,
    document,
    event_metadata: imported.event_metadata,
    levels: {
      L0: { status: "in_progress", confirmed_at: null },
      L1: { status: "in_progress", confirmed_at: null },
      L2: { status: "in_progress", confirmed_at: null },
      L3: { status: "in_progress", confirmed_at: null },
    },
    updated_at: now,
  };
  map_source_pages(project, segment.source_pages);
  return project;
}

function is_batch_generated(row: existing_calibration_row): boolean {
  const document = JSON.parse(row.document_json) as score_document;
  return document.provenance.importer_version ===
    "beyer-batch-calibration/v1";
}

function restore_existing_project(
  row: existing_calibration_row,
): calibration_project {
  const project = JSON.parse(row.project_json) as calibration_project;
  project.document = JSON.parse(row.document_json) as score_document;
  project.event_metadata = JSON.parse(
    row.event_metadata_json,
  ) as calibration_project["event_metadata"];
  return project;
}

function apply_generated_fingerings(document: score_document): void {
  for (const measure of document.measures) {
    for (const event of measure.events) {
      const inferred = infer_note_fingerings(
        event.notes.map((note) => note.midi),
        event.hand,
        { tonic_midi: document.tonic_midi },
      );
      event.notes.forEach((note, index) => {
        if (note.finger !== undefined && note.fingering) {
          return;
        }
        const fingering = inferred[index];
        if (!fingering) {
          return;
        }
        note.finger = fingering.finger;
        note.fingering = {
          source: "generated",
          status: "published",
          reason: generated_reason,
          confirmed_by: null,
          confirmed_at: null,
          source_refs: [],
        };
      });
    }
  }
}

function map_source_pages(
  project: calibration_project,
  source_pages: number[],
): void {
  for (const metadata of Object.values(project.event_metadata)) {
    const relative_page = Math.max(1, metadata.source_page ?? 1);
    metadata.source_page =
      source_pages[Math.min(relative_page - 1, source_pages.length - 1)] ??
      source_pages[0] ??
      null;
  }
}

function repair_structural_issues(
  project: calibration_project,
): prepared_calibration["repairs"] {
  let meter_extensions = 0;
  for (const measure of project.document.measures) {
    const event_end = measure.events.reduce(
      (maximum, event) =>
        Math.max(maximum, event.onset_beats + event.duration_beats),
      0,
    );
    if (event_end > measure.meter.beats + 0.002) {
      measure.meter.beats = Math.ceil(event_end - 0.002);
      meter_extensions += 1;
    }
  }

  let orphan_ties_removed = 0;
  const validation = validate_calibration_project(project);
  const orphan_event_ids = new Set(
    validation.issues
      .filter((issue) => issue.code === "orphan_tie" && issue.event_id)
      .map((issue) => issue.event_id as string),
  );
  for (const measure of project.document.measures) {
    for (const event of measure.events) {
      if (orphan_event_ids.has(event.id)) {
        delete event.tie;
        orphan_ties_removed += 1;
      }
    }
  }
  return { meter_extensions, orphan_ties_removed };
}

function add_practice_fingerings(
  practice: Record<string, unknown>,
  document: score_document,
): Record<string, unknown> {
  const events = Array.isArray(practice.events)
    ? practice.events as Array<Record<string, unknown>>
    : [];
  return {
    ...practice,
    events: events.map((event) => {
      const notes = Array.isArray(event.notes)
        ? event.notes.map(Number).filter(Number.isFinite)
        : [];
      const hand = event.hand === "left" || event.hand === "right"
        ? event.hand
        : "both";
      const measure_index = Math.max(0, Number(event.measure_index ?? 1) - 1);
      const onset = Number(event.onset_beats ?? 0);
      const candidates = (document.measures[measure_index]?.events ?? [])
        .filter((candidate) =>
          Math.abs(candidate.onset_beats - onset) < 0.002 &&
          (hand === "both" || candidate.hand === hand))
        .flatMap((candidate) =>
          candidate.notes.map((note) => ({
            note,
            hand: candidate.hand,
          })));
      const used = new Set<number>();
      const inferred = infer_note_fingerings(notes, hand, {
        tonic_midi: document.tonic_midi,
      });
      const fingerings = notes.map((note, index) => {
        const candidate_index = candidates.findIndex((candidate, candidate_index) =>
          !used.has(candidate_index) && candidate.note.midi === note);
        if (candidate_index >= 0) {
          used.add(candidate_index);
          const candidate = candidates[candidate_index];
          if (candidate.note.finger !== undefined) {
            return {
              note,
              hand: candidate.hand,
              finger: candidate.note.finger,
              source: candidate.note.fingering?.source === "generated"
                ? "generated"
                : "score",
            };
          }
        }
        return inferred[index];
      }).filter(Boolean);
      return {
        ...event,
        fingerings,
      };
    }),
  };
}

function write_all(prepared: prepared_calibration[]): void {
  const normalized_items = prepared.map((item) => {
    try {
      return {
        item,
        normalized: validate_score_calibration_save({
          project: item.project,
          validation: item.validation,
        }, {
          published_by: item.preserved_manual
            ? "calibration-workbench"
            : "beyer-batch-calibration",
        }),
      };
    } catch (error) {
      throw new Error(
        `${item.segment.id} 预校验失败：${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  });

  const backup_dir = resolve(
    project_root,
    `.trae/backups/beyer-calibration-${new Date().toISOString().replaceAll(":", "-")}`,
  );
  mkdirSync(backup_dir, { recursive: true });
  const database_backup_path = resolve(backup_dir, "panio.sqlite");
  execFileSync("sqlite3", [
    database_path,
    `.backup '${database_backup_path.replaceAll("'", "''")}'`,
  ]);

  for (const item of prepared) {
    atomic_write(item.jianpu_path, item.jianpu_json);
    if (item.practice_path && item.practice_json) {
      atomic_write(item.practice_path, item.practice_json);
    }
  }
  synchronize_jianpu_catalog(prepared);
  atomic_write(
    jianpu_catalog_path,
    `${JSON.stringify(jianpu_catalog, null, 2)}\n`,
  );

  const repository = open_database(database_path);
  try {
    for (const { item, normalized } of normalized_items) {
      try {
        repository.save_score_calibration(null, {
          ...normalized,
          original_sync: {
            original_data_path: item.jianpu_path,
            original_data_sha256: sha256(item.jianpu_json),
            sync_state: "synced",
          },
        });
      } catch (error) {
        throw new Error(
          `${item.segment.id} 写入失败：${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    }
  } finally {
    repository.close();
  }
}

function synchronize_jianpu_catalog(
  prepared: prepared_calibration[],
): void {
  const target_material = get_beyer_material(jianpu_catalog);
  const target_by_id = new Map(
    target_material.segments.map((segment) => [segment.id, segment]),
  );
  for (const item of prepared) {
    const target = target_by_id.get(item.segment.id);
    if (!target) {
      continue;
    }
    const score = JSON.parse(item.jianpu_json) as {
      key_signature: string;
      tonic_midi: number;
      time_signature: string;
      measures: Array<{
        events: Array<{
          right_notes: number[];
          left_notes: number[];
          chord?: string | null;
        }>;
      }>;
    };
    const events = score.measures.flatMap((measure) => measure.events);
    const has_right_hand = events.some((event) => event.right_notes.length > 0);
    const has_left_hand = events.some((event) => event.left_notes.length > 0);
    target.measure_count = score.measures.length;
    const last_page_slice = target.page_slices.at(-1);
    if (last_page_slice) {
      last_page_slice.measure_end = score.measures.length;
    }
    target.time_signature = score.time_signature;
    target.key_signature = score.key_signature;
    target.tonic_midi = score.tonic_midi;
    target.has_left_hand = has_left_hand;
    target.hand_mode = has_right_hand && has_left_hand
      ? "both"
      : has_left_hand
        ? "left"
        : "right";
    target.chord_count = events.filter((event) => Boolean(event.chord)).length;
  }
}

function preserve_jianpu_chords(
  target: ReturnType<typeof score_document_to_jianpu_score>,
  existing: Record<string, unknown>,
): void {
  const source_measures = Array.isArray(existing.measures)
    ? existing.measures as Array<{
        number?: string;
        events?: Array<{
          onset_beats?: number;
          duration_beats?: number;
          right_notes?: number[];
          left_notes?: number[];
          chord?: string | null;
        }>;
      }>
    : [];
  const source_by_number = new Map(
    source_measures.map((measure, index) => [
      String(measure.number ?? index + 1),
      measure,
    ]),
  );

  for (const [measure_index, measure] of target.measures.entries()) {
    const source = source_by_number.get(String(measure.number))
      ?? source_measures[measure_index];
    if (!source?.events) {
      continue;
    }
    const chords = new Map(
      source.events
        .filter((event) => typeof event.chord === "string" && event.chord.length > 0)
        .map((event) => [jianpu_event_key(event), event.chord!]),
    );
    for (const event of measure.events) {
      const chord = chords.get(jianpu_event_key(event));
      if (chord) {
        event.chord = chord;
      }
    }
  }
}

function preserve_project_hands(
  document: score_document,
  existing: Record<string, unknown>,
): void {
  const source_measures = Array.isArray(existing.measures)
    ? existing.measures as Array<{
        number?: string;
        events?: Array<{
          onset_beats?: number;
          duration_beats?: number;
          right_notes?: number[];
          left_notes?: number[];
        }>;
      }>
    : [];
  const source_events = source_measures.flatMap((measure) => measure.events ?? []);
  const source_has_right = source_events.some((event) =>
    (event.right_notes?.length ?? 0) > 0);
  const source_has_left = source_events.some((event) =>
    (event.left_notes?.length ?? 0) > 0);
  const document_events = document.measures.flatMap((measure) => measure.events);
  const document_has_right = document_events.some((event) => event.hand === "right");
  const document_has_left = document_events.some((event) => event.hand === "left");

  if (source_has_left && !source_has_right && document_has_right && !document_has_left) {
    for (const event of document_events) {
      event.hand = "left";
    }
  } else if (
    source_has_right &&
    !source_has_left &&
    document_has_left &&
    !document_has_right
  ) {
    for (const event of document_events) {
      event.hand = "right";
    }
  }
}

function jianpu_event_key(event: {
  onset_beats?: number;
  duration_beats?: number;
  right_notes?: number[];
  left_notes?: number[];
}): string {
  return JSON.stringify([
    event.onset_beats,
    event.duration_beats,
    event.right_notes ?? [],
    event.left_notes ?? [],
  ]);
}

function build_report(prepared: prepared_calibration[]): {
  summary: string;
  markdown: string;
} {
  const manual = prepared.filter((item) => item.preserved_manual).length;
  const generated = prepared.length - manual;
  const documents_with_errors = prepared.filter((item) =>
    item.validation.issues.some((issue) => issue.severity === "error"));
  const note_count = prepared.reduce(
    (total, item) =>
      total + item.project.document.measures.reduce(
        (measure_total, measure) =>
          measure_total + measure.events.reduce(
            (event_total, event) => event_total + event.notes.length,
            0,
          ),
        0,
      ),
    0,
  );
  const fingered_count = prepared.reduce(
    (total, item) =>
      total + item.project.document.measures.reduce(
        (measure_total, measure) =>
          measure_total + measure.events.reduce(
            (event_total, event) =>
              event_total + event.notes.filter((note) =>
                note.finger !== undefined).length,
            0,
          ),
        0,
      ),
    0,
  );
  const meter_extensions = prepared.reduce(
    (total, item) => total + item.repairs.meter_extensions,
    0,
  );
  const orphan_ties_removed = prepared.reduce(
    (total, item) => total + item.repairs.orphan_ties_removed,
    0,
  );
  const issue_counts = new Map<string, number>();
  for (const item of prepared) {
    for (const issue of item.validation.issues) {
      issue_counts.set(issue.code, (issue_counts.get(issue.code) ?? 0) + 1);
    }
  }
  const issue_rows = [...issue_counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([code, count]) => `| ${code} | ${count} |`)
    .join("\n");
  const error_rows = documents_with_errors
    .map((item) => {
      const codes = [...new Set(
        item.validation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => `${issue.code}: ${issue.message}`),
      )].slice(0, 4).join("<br>");
      return `| ${item.segment.sequence} | ${item.segment.id} | ${codes} |`;
    })
    .join("\n");
  const summary = [
    `片段=${prepared.length}`,
    `人工保留=${manual}`,
    `自动校准=${generated}`,
    `音符=${note_count}`,
    `已有指法=${fingered_count}`,
    `拍数修复=${meter_extensions}`,
    `孤立Tie修复=${orphan_ties_removed}`,
    `含错误片段=${documents_with_errors.length}`,
  ].join(" ");
  return {
    summary,
    markdown: `# 拜厄钢琴基本教程批量校准报告

- 生成时间：${new Date().toISOString()}
- 原始 PDF：\`.trae/pdf/拜厄钢琴基本教程 (Beyer) (z-library.sk, 1lib.sk, z-lib.sk).pdf\`
- OMR 工程：\`.trae/omr/beyer-clean/beyer_music_pages.omr\`
- 乐章/片段：${prepared.length}
- 保留人工校准：${manual}
- 自动结构校准：${generated}
- 音符总数：${note_count}
- 已有逐音指法：${fingered_count}
- 按事件终点扩展小节拍数：${meter_extensions}
- 移除跨乐章孤立 Tie：${orphan_ties_removed}
- 含错误片段：${documents_with_errors.length}

## 校准策略

人工校准片段 032、047、048、049 原样保留。其余片段从 Audiveris 导出的原始 MusicXML 重建 ScoreDocument，保留音高、时值、声部、休止符、Tie、Slur、力度与发音记号；逐音指法依据人工样本中的固定手位规则生成，来源标记为 \`generated\`。原始 PDF、OMR 和源 MusicXML 均未改写。

## 自动校验问题

| 问题代码 | 数量 |
| --- | ---: |
${issue_rows || "| 无 | 0 |"}

## 含错误片段

| 序号 | 片段 | 错误 |
| ---: | --- | --- |
${error_rows || "| - | 无 | 无 |"}

## 限制

自动校准不能替代逐页视觉复核。${should_write
  ? "数据库与教材 JSON 已保存批量校准结果，"
  : "当前仅完成内存审计，尚未写入数据库与教材 JSON，"}教材发布门禁仍应保留人工视觉核对要求。
`,
  };
}

function load_existing_calibrations(
  path: string,
): Map<string, existing_calibration_row> {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = database.prepare(`
      SELECT segment_id, project_json, document_json, event_metadata_json
      FROM score_calibrations
      WHERE material_id = 'beyer'
    `).all() as unknown as existing_calibration_row[];
    return new Map(rows.map((row) => [row.segment_id, row]));
  } finally {
    database.close();
  }
}

function get_beyer_material(catalog: jianpu_catalog): jianpu_material {
  const material = catalog.materials.find((item) => item.id === "beyer");
  if (!material) {
    throw new Error("jianpu-catalog.json 中未找到拜厄教材。");
  }
  if (material.segments.length !== 170) {
    throw new Error(`拜厄教材片段数应为 170，实际为 ${material.segments.length}。`);
  }
  return material;
}

function read_json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function atomic_write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary_path = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary_path, content, "utf8");
  renameSync(temporary_path, path);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
