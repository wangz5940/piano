#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  normalize_musicxml_divisions,
  parse_musicxml_to_score_document,
} from "../src/features/calibration/musicxml.ts";
import { synchronize_project_notation_metadata } from "../src/features/calibration/notationSync.ts";
import { validate_calibration_project } from "../src/features/calibration/validation.ts";
import type { calibration_project } from "../src/features/calibration/types.ts";
import type { jianpu_catalog, jianpu_score } from "../src/features/jianpu/types.ts";
import type { score_document } from "../src/features/score/types.ts";
import { score_document_to_jianpu_score } from "../server/app.mjs";
import { apply_source_correction, type SourceCorrection } from "./lib/textbookCorrections.ts";
import { apply_reference_fingerings } from "./lib/referenceFingerings.ts";
import { preserve_chord_labels } from "./lib/preserveChordLabels.ts";

type Row = Record<string, string | null>;
interface Segment {
  id: string;
  sequence: number;
  title: string;
  musicxml_url: string;
  sha256: string;
  source_pages: number[];
  source_page_label: string;
  measure_count: number;
  derived_assets: { practice_events_url?: string; source_sha256: string };
}
interface Catalog {
  materials: Array<{ id: string; title: string; page_count: number; segments: Segment[] }>;
}

const root = resolve(import.meta.dirname, "..");
const option = (name: string, fallback: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = resolve(root, option("output", ".generated/textbook-recalibration"));
const selected_materials = new Set(option("materials",
  "beyer,john-thompson-easiest-1,john-thompson-easiest-2").split(","));
const write = process.argv.includes("--write");
const now = new Date().toISOString();
const version = "textbook-recalibration/v2";
const db = new DatabaseSync(resolve(root, "data/panio.sqlite"));
const rows = db.prepare("SELECT * FROM score_calibrations ORDER BY id").all() as Row[];
const deletions = db.prepare("SELECT * FROM material_deletions ORDER BY segment_id").all() as Row[];
const manual_audits = new Set(db.prepare(
  "SELECT target_id FROM audit_events WHERE action = 'admin.score_calibration.save'",
).all().map((row) => String(row.target_id)));
const by_segment = new Map(rows.map((row) => [row.segment_id!, row]));
const deleted = new Set(deletions.filter((row) => row.deletion_status === "deleted")
  .map((row) => row.segment_id));
const originals = new Map<string, Buffer>();
const staged = new Map<string, string>();
const catalog_path = resolve(root, "public/materials/catalog.json");
const jianpu_catalog_path = resolve(root, "public/materials/jianpu-catalog.json");
const catalog = JSON.parse(read(catalog_path)) as Catalog;
const jianpu_catalog = JSON.parse(read(jianpu_catalog_path)) as jianpu_catalog;
const corrections = JSON.parse(read(resolve(root, "scripts/textbook-source-corrections.json"))) as Record<string, SourceCorrection>;
const protected_segments: Array<{ id: string; reason: string }> = [];
const results: Array<{
  id: string;
  source_pages: number[];
  source_sha256: string;
  divisions_repaired: number;
  measures: number;
  notes: number;
  rests: number;
  generated_fingerings: number;
  source_correction?: string;
  changes: Record<string, number>;
  issues: ReturnType<typeof validate_calibration_project>["issues"];
  project: calibration_project;
  jianpu_path: string;
}> = [];

try {
  for (const material of catalog.materials) {
    if (!selected_materials.has(material.id)) continue;
    const jianpu_material = jianpu_catalog.materials.find((item) => item.id === material.id);
    if (!jianpu_material) throw new Error(`Missing jianpu material: ${material.id}`);
    for (const segment of material.segments) {
      const row = by_segment.get(segment.id);
      const jianpu_segment = jianpu_material.segments.find((item) => item.id === segment.id);
      const existing = row ? JSON.parse(row.document_json!) : undefined;
      const generated = existing?.provenance?.importer_version;
      const xml_path = asset(segment.musicxml_url);
      const public_xml = read(xml_path);
      const export_path = resolve(root, "public/materials/calibration", material.id,
        `${String(segment.sequence).padStart(3, "0")}.json`);
      const previous_export = existsSync(export_path) ? JSON.parse(read(export_path)) : undefined;
      const expected_xml_hash = generated === version
        ? previous_export?.musicxml_sha256 : segment.sha256;
      let reason = "";
      if (deleted.has(segment.id)) reason = "soft_deleted";
      else if (row && (row.updated_by || manual_audits.has(row.id!) ||
        !["beyer-batch-calibration/v1", version].includes(generated))) reason = "human_calibration";
      else if (hash(public_xml) !== expected_xml_hash) reason = "modified_musicxml";
      else if (row?.original_data_sha256 && jianpu_segment &&
        hash(read(asset(jianpu_segment.jianpu_url))) !== row.original_data_sha256) reason = "modified_jianpu";
      else if (!jianpu_segment) reason = "no_pitched_jianpu_segment";
      if (reason || !jianpu_segment) {
        protected_segments.push({ id: segment.id, reason });
        continue;
      }
      const source_path = resolve(root, ".trae/documents",
        `${material.title}_MusicXML`, segment.musicxml_url.split("/").at(-1)!);
      const source_xml = read(source_path);
      if (hash(source_xml) !== segment.sha256) {
        throw new Error(`${segment.id}: original MusicXML SHA mismatch`);
      }
      const normalized = normalize_musicxml_divisions(source_xml);
      const correction = corrections[segment.id];
      const corrected_xml = apply_source_correction(normalized.xml, correction);
      const work = {
        composer: material.id === "beyer" ? "Ferdinand Beyer" : "John Thompson",
        opus: String(segment.sequence),
        edition: material.title,
        publisher: "",
        source: segment.source_page_label,
      };
      const imported = parse_musicxml_to_score_document(corrected_xml, work, {
        id: `score-${segment.id}`,
        source_file: segment.musicxml_url,
      });
      const document: score_document = imported.document;
      document.title = `${material.title} · ${jianpu_segment.title}`;
      document.provenance = {
        ...document.provenance,
        kind: "legacy",
        source_id: segment.id,
        source_sha256: segment.sha256,
        importer_version: version,
      };
      document.review.note = "从原始识谱重新校准结构；未将自动校验冒充人工逐音确认。";
      const project: calibration_project = {
        schema_version: 1,
        id: `material:${material.id}:${segment.id}`,
        title: document.title,
        work,
        source: {
          file_name: segment.musicxml_url,
          mime_type: "application/vnd.recordare.musicxml+xml",
          page_count: material.page_count,
          attached_at: now,
        },
        material_catalog: {
          material_id: material.id,
          title: material.title,
          chapters: jianpu_material.chapters,
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
      for (const metadata of Object.values(project.event_metadata)) {
        metadata.source_page = segment.source_pages[(metadata.source_page ?? 1) - 1] ?? null;
      }
      const jianpu_path = asset(jianpu_segment.jianpu_url);
      const before = JSON.parse(read(jianpu_path));
      // Preserve the established hand for a single-staff exercise (early Beyer
      // intentionally writes left-hand exercises in the treble clef).
      if (!correction?.hand && !/<staves>\s*[2-9]/u.test(corrected_xml) &&
        (corrected_xml.match(/<part id=/gu)?.length ?? 0) === 1 &&
        jianpu_segment.hand_mode !== "both") {
        for (const measure of document.measures) {
          for (const event of measure.events) {
            event.hand = jianpu_segment.hand_mode;
            project.event_metadata[event.id].hand = event.hand;
          }
        }
      }
      const references = rows.filter((candidate) =>
        candidate.material_id === material.id &&
        (candidate.updated_by || manual_audits.has(candidate.id!)))
        .map((candidate) => ({
          id: candidate.segment_id!,
          document: JSON.parse(candidate.document_json!) as score_document,
        }));
      const generated_fingerings = apply_reference_fingerings(project, references);
      synchronize_project_notation_metadata(project);
      preserve_chord_labels(document, before,
        score_document_to_jianpu_score(document, segment.id, project.event_metadata) as jianpu_score);
      const validation = validate_calibration_project(project);
      const score = score_document_to_jianpu_score(document, segment.id, project.event_metadata) as jianpu_score;
      const before_events = before.measures.flatMap((measure: { events: unknown[] }) => measure.events);
      const after_events = score.measures.flatMap((measure: { events: unknown[] }) => measure.events);
      const events = document.measures.flatMap((measure) => measure.events);
      const summary = {
        id: segment.id,
        source_pages: segment.source_pages,
        source_sha256: segment.sha256,
        divisions_repaired: normalized.repaired_measures,
        measures: document.measures.length,
        notes: events.reduce((sum, event) => sum + event.notes.length, 0),
        rests: events.filter((event) => !event.notes.length).length,
        generated_fingerings,
        source_correction: correction?.evidence,
        changes: {
          measure_count: score.measures.length - before.measures.length,
          event_count: after_events.length - before_events.length,
        },
        issues: validation.issues,
        project,
        jianpu_path,
      };
      results.push(summary);
      stage(jianpu_path, JSON.stringify(score) + "\n");
      stage(xml_path, corrected_xml);
      stage(export_path, JSON.stringify({
        musicxml_sha256: hash(corrected_xml), project, validation,
      }) + "\n");
      const practice_url = segment.derived_assets.practice_events_url;
      if (practice_url) {
        read(asset(practice_url));
        stage(asset(practice_url), JSON.stringify({
          schema_version: "1.0",
          asset_id: segment.id,
          source_sha256: segment.sha256,
          events: practice_events(document),
        }, null, 2) + "\n");
      }
      jianpu_segment.measure_count = score.measures.length;
      jianpu_segment.time_signature = score.time_signature;
      jianpu_segment.key_signature = score.key_signature;
      jianpu_segment.tonic_midi = score.tonic_midi;
      const hands = new Set(events.filter((event) => event.notes.length).map((event) => event.hand));
      jianpu_segment.has_left_hand = hands.has("left");
      jianpu_segment.hand_mode = hands.size > 1 ? "both" : hands.has("left") ? "left" : "right";
      jianpu_segment.chord_count = score.measures.reduce((sum, measure) =>
        sum + measure.events.filter((event) => event.chord).length, 0);
      // Rebuild page ranges from aligned measures; leave the original page text.
      let next_measure = 1;
      jianpu_segment.page_slices = jianpu_segment.page_slices.map((slice, slice_index, slices) => {
        const indices = document.measures.flatMap((measure, index) =>
          measure.events.some((event) =>
            slice.source_pages.includes(project.event_metadata[event.id]?.source_page ?? -1))
            ? [index + 1] : []);
        const end = slice_index === slices.length - 1 ? document.measures.length
          : indices.at(-1) ?? slice.measure_end;
        const start = next_measure;
        next_measure = end + 1;
        return {
          ...slice,
          measure_start: start,
          measure_end: end,
        };
      });
    }
  }
  stage(jianpu_catalog_path, JSON.stringify(jianpu_catalog, null, 2) + "\n");
  const report = {
    schema: "textbook-recalibration-report/v2",
    generated_at: now,
    protected_segments,
    results: results.map((item) => ({
      id: item.id,
      source_pages: item.source_pages,
      source_sha256: item.source_sha256,
      divisions_repaired: item.divisions_repaired,
      measures: item.measures,
      notes: item.notes,
      rests: item.rests,
      generated_fingerings: item.generated_fingerings,
      source_correction: item.source_correction,
      changes: item.changes,
      issues: item.issues,
    })),
  };
  mkdirSync(output, { recursive: true });
  atomic(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  atomic(resolve(output, "report.md"), format_report());
  for (const [path, content] of staged) {
    atomic(resolve(output, "staged", relative(root, path)), content);
  }
  console.log(JSON.stringify({
    calibrated: results.length,
    protected: protected_segments,
    divisions_repaired: results.reduce((sum, item) => sum + item.divisions_repaired, 0),
    errors: results.reduce((sum, item) => sum + item.issues.filter((issue) => issue.severity === "error").length, 0),
    output,
  }, null, 2));
  if (write) {
    const backup_dir = resolve(root, ".trae/backups", `textbook-write-${Date.now()}`);
    mkdirSync(backup_dir, { recursive: true });
    execFileSync("sqlite3", [resolve(root, "data/panio.sqlite"),
      `.backup '${resolve(backup_dir, "panio.sqlite").replaceAll("'", "''")}'`]);
    for (const [path, bytes] of originals) {
      if (staged.has(path)) {
        const backup = resolve(backup_dir, relative(root, path));
        mkdirSync(dirname(backup), { recursive: true });
        writeFileSync(backup, bytes);
      }
    }
    const written_paths: string[] = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      if (JSON.stringify(db.prepare("SELECT * FROM score_calibrations ORDER BY id").all()) !== JSON.stringify(rows) ||
        JSON.stringify(db.prepare("SELECT * FROM material_deletions ORDER BY segment_id").all()) !== JSON.stringify(deletions)) {
        throw new Error("Calibration or deletion changed while preparing; abort without overwriting.");
      }
      for (const [path, bytes] of originals) {
        if (!readFileSync(path).equals(bytes)) throw new Error(`Source changed during preparation: ${path}`);
      }
      const save = db.prepare(`
        INSERT INTO score_calibrations(id,material_id,segment_id,project_json,document_json,
          event_metadata_json,validation_json,original_data_path,original_data_sha256,
          sync_state,updated_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'synced',NULL,?,?)
        ON CONFLICT(id) DO UPDATE SET
          project_json=excluded.project_json,document_json=excluded.document_json,
          event_metadata_json=excluded.event_metadata_json,validation_json=excluded.validation_json,
          original_data_path=excluded.original_data_path,original_data_sha256=excluded.original_data_sha256,
          sync_state=excluded.sync_state,updated_at=excluded.updated_at
      `);
      for (const item of results) {
        const project = item.project;
        save.run(project.id, project.material_catalog!.material_id, item.id,
          JSON.stringify(project), JSON.stringify(project.document), JSON.stringify(project.event_metadata),
          JSON.stringify(validate_calibration_project(project)), item.jianpu_path,
          hash(staged.get(item.jianpu_path)!), by_segment.get(item.id)?.created_at ?? now, now);
      }
      for (const [path, content] of staged) {
        atomic(path, content);
        written_paths.push(path);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      for (const path of written_paths.reverse()) {
        const bytes = originals.get(path);
        if (bytes) writeFileSync(path, bytes);
        else unlinkSync(path);
      }
      throw error;
    }
    atomic(resolve(root, "reports/textbook-recalibration-2026-09-30.json"), JSON.stringify(report, null, 2) + "\n");
    atomic(resolve(root, "reports/textbook-recalibration-2026-09-30.md"), format_report());
    console.log(`Written ${results.length} calibrations; backup: ${backup_dir}`);
  } else {
    console.log("Staged only. Use --write to apply with concurrency checks and a database backup.");
  }
} finally {
  db.close();
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function read(path: string): string {
  const bytes = readFileSync(path);
  if (!originals.has(path)) originals.set(path, bytes);
  return bytes.toString("utf8");
}
function stage(path: string, content: string) {
  if (existsSync(path) && !originals.has(path)) read(path);
  staged.set(path, content);
}
function asset(url: string): string {
  if (!url.startsWith("/materials/") || url.includes("..")) throw new Error(`Invalid asset path: ${url}`);
  return resolve(root, "public", url.slice(1));
}
function atomic(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.recalibration.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}
function midi_name(midi: number): string {
  return `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function format_report(): string {
  const count_errors = (item: typeof results[number]) =>
    item.issues.filter((issue) => issue.severity === "error").length;
  const error_segments = results.filter((item) => count_errors(item) > 0);
  const protected_by_reason = (reason: string) =>
    protected_segments.filter((item) => item.reason === reason).map((item) => item.id);
  return [
    "# 小汤1、小汤2、拜厄重新校准记录",
    "",
    `生成时间：${now}；流程：${version}。`,
    "",
    `本轮更新 ${results.length} 个教材片段，共 ${results.reduce((sum, item) => sum + item.notes, 0)} 个音符。`,
    `其中 ${error_segments.length} 个片段仍有 ${error_segments.reduce((sum, item) => sum + count_errors(item), 0)} 条节拍或连线错误；所有输出保留 needs_review，L0–L3 未标记为人工确认。无 error 也不代表已逐音校对。`,
    "",
    "## 已完成的修正",
    "",
    "- 按小节号和重复次数对齐声部，左右手按局部谱表与明确手别识别；忽略隐藏的占位休止。",
    `- 恢复 ${results.reduce((sum, item) => sum + item.divisions_repaired, 0)} 个 part/measure 中可唯一推导的零 divisions 时间刻度，保留原 XML 版式、连线与其他记谱信息。`,
    "- 恢复原谱拍号，保留中途换拍和换调；不扩大拍数或截断时值来隐藏识谱错误。",
    "- 简谱保留左右手休止、逐小节调性和拍号；跟弹按同时起音分组，并在 source_events 中保留各声部时值。",
    `- 仅从人工样本中提取一致的固定五指手位，按整句音域与已有指号唯一匹配，生成 ${results.reduce((sum, item) => sum + item.generated_fingerings, 0)} 个待复核指号。已有和弦标签仅在小节、时值和双手音高完全匹配时保留。`,
    ...results.filter((item) => item.source_correction).map((item) =>
      `- ${item.id}：${item.source_correction}`),
    "",
    "## 保留范围",
    "",
    `人工校准原样保留：${protected_by_reason("human_calibration").join("、")}。`,
    "",
    `保留软删除状态的片段：${protected_by_reason("soft_deleted").length} 个；无可用音高简谱而跳过：${protected_by_reason("no_pitched_jianpu_segment").join("、")}。`,
    "原始 PDF/OMR/MusicXML、哈农、人工校准及已删除片段的资源和数据库行均不由本流程写入。数据库与备份不提交 Git。",
    "",
    "## 仍需复核的范围",
    "",
    "自由节奏的认音谱例暂按旧模型表示，可能触发超拍提示；原 OMR 的漏音、误休止、错分声部和装饰音仍须结合原页处理。完整 issues（含小节和事件 ID）见同名 JSON 报告与逐段校准快照。",
    "",
    "| 片段 | PDF页 | 小节 | 音符 | error | 其他提示 |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...results.map((item) =>
      `| ${item.id} | ${item.source_pages.join("、")} | ${item.measures} | ${item.notes} | ${count_errors(item)} | ${item.issues.length - count_errors(item)} |`),
    "",
    "## 复现与验证",
    "",
    "需要本地 data/panio.sqlite、原始 .trae/documents/*_MusicXML，以及现有教材资源。",
    "",
    "```sh",
    "npm run calibrate:textbooks",
    "npm run verify:textbooks -- --output=.generated/textbook-recalibration",
    "npm run calibrate:textbooks:write",
    "npm run verify:textbooks",
    "npm test",
    "npm run check",
    "npx tsc -p scripts/tsconfig.json",
    "npm run lint",
    "npm run build",
    "```",
    "",
    "默认只生成暂存结果。--write 自动备份数据库和待覆盖文件，在事务中再次检查人工记录、删除状态和输入文件；检测到并发修改时停止覆盖。失败时回滚数据库和已写文件。",
    "public/materials/calibration/<教材>/<序号>.json 保存校准工程及校验结果；生产使用的简谱、MusicXML、跟弹资源一同提交。校准数据库行写入本机 SQLite，其他实例的数据库不会被 Git 自动更新。",
    "",
  ].join("\n");
}

function practice_events(document: score_document) {
  return document.measures.flatMap((measure, index) => {
    const groups = new Map<number, typeof measure.events>();
    for (const event of measure.events.filter((event) => event.notes.length)) {
      const onset = Number(event.onset_beats.toFixed(9));
      const group = groups.get(onset) ?? [];
      group.push(event);
      groups.set(onset, group);
    }
    return [...groups].sort(([a], [b]) => a - b).map(([onset, events], group_index) => {
      const notes = events.flatMap((event) => event.notes);
      const hands = new Set(events.map((event) => event.hand));
      return {
        id: `${document.id}-m${index + 1}-step${group_index + 1}`,
        measure_index: index + 1,
        measure_number: measure.number,
        onset_beats: onset,
        duration_beats: Math.max(...events.map((event) => event.duration_beats)),
        notes: notes.map((note) => note.midi),
        note_names: notes.map((note) => midi_name(note.midi)),
        notation: `第 ${index + 1} 小节`,
        hand: hands.size > 1 ? "both" : events[0].hand,
        match_mode: notes.length > 1 ? "chord" : "single_note",
        fingerings: events.flatMap((event) =>
          event.notes.filter((note) => note.finger).map((note) => ({
            note: note.midi, finger: note.finger, hand: event.hand,
            source: note.fingering?.source === "generated" ? "generated" : "score",
          }))),
        // The guided-input contract groups simultaneous keys. Retain original
        // voice durations as well, so this grouping does not erase sustain.
        source_events: events.map((event) => ({
          id: event.id, hand: event.hand, voice: event.voice,
          duration_beats: event.duration_beats, notes: event.notes.map((note) => note.midi),
        })),
      };
    });
  });
}
