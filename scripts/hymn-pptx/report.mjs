import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { inspect_pptx_package } from "./ooxml-parser.mjs";
import { scan_hymn_pptx } from "./scanner.mjs";
import { serialize_source } from "./source-serializer.mjs";

export async function create_scan_report(options = {}) {
  const scan = await scan_hymn_pptx(options);
  const inspections = await inspect_files(scan.files);
  return build_scan_report(scan, inspections);
}

export function build_scan_report(scan, inspections) {
  const files = [];
  const failures = scan.failures.map(to_report_failure);

  for (const file of scan.files) {
    const inspection = inspections.get(file.absolute_path);

    if (!inspection || inspection.error) {
      failures.push({
        ...to_report_file(file),
        reason: "invalid_ooxml_package",
        message: inspection?.error?.message ?? "未生成 OOXML 检查结果",
      });
      continue;
    }

    files.push({
      ...to_report_file(file),
      slide_count: inspection.slide_count,
    });
  }

  return {
    schema_version: 1,
    report_type: "hymn_pptx_scan",
    summary: {
      discovered_file_count: scan.discovered_file_count,
      valid_file_count: files.length,
      failure_count: failures.length,
      slide_count: files.reduce(
        (total, file) => total + file.slide_count,
        0,
      ),
    },
    files,
    failures,
  };
}

export function render_scan_report(report) {
  return [
    `PPTX 文件：${report.summary.valid_file_count}/${report.summary.discovered_file_count}`,
    `幻灯片：${report.summary.slide_count}`,
    `失败：${report.summary.failure_count}`,
  ].join("\n");
}

export async function write_scan_report(output_path, report) {
  await mkdir(dirname(output_path), { recursive: true });
  await writeFile(output_path, serialize_source(report), {
    encoding: "utf8",
    flag: "w",
  });
}

async function inspect_files(files) {
  const inspections = new Map();
  const concurrency = Math.min(8, Math.max(files.length, 1));
  let next_index = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next_index < files.length) {
      const file = files[next_index];
      next_index += 1;

      try {
        inspections.set(
          file.absolute_path,
          await inspect_pptx_package(file.absolute_path),
        );
      } catch (error) {
        inspections.set(file.absolute_path, { error });
      }
    }
  }));

  return inspections;
}

function to_report_file(file) {
  return {
    hymn_id: file.hymn_id,
    title: file.title,
    file_name: file.file_name,
    relative_path: file.relative_path,
    source_id: file.source_id,
    score_id: file.score_id,
    byte_length: file.byte_length,
    sha256: file.sha256,
  };
}

function to_report_failure(failure) {
  return {
    hymn_id: failure.hymn_id,
    title: failure.title,
    file_name: failure.file_name,
    relative_path: failure.relative_path,
    byte_length: failure.byte_length,
    sha256: failure.sha256,
    reason: failure.reason,
  };
}
