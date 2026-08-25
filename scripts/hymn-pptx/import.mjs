#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assert_simpmusic_semantic_decoding_ready,
} from "./font-config.mjs";
import {
  build_full_hymn_import,
  default_full_import_output,
} from "./full-import.mjs";
import {
  create_scan_report,
  render_scan_report,
  write_scan_report,
} from "./report.mjs";
import { serialize_source } from "./source-serializer.mjs";

const project_root = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

try {
  const options = parse_arguments(process.argv.slice(2));

  if (options.help) {
    print_help();
  } else {
    const font_verification =
      await prepare_hymn_pptx_semantic_import();
    if (options.scan) {
      const report = await create_scan_report({
        input_root: options.input_root,
        project_root,
      });
      if (options.output_path) {
        await write_scan_report(options.output_path, report);
      }
      if (options.json) {
        process.stdout.write(serialize_source(report));
      } else {
        console.log(render_scan_report(report));
        if (options.output_path) {
          console.log(`扫描报告：${options.output_path}`);
        }
      }
      if (report.summary.failure_count > 0) {
        process.exitCode = 1;
      }
    } else {
      const result = await build_full_hymn_import({
        input_root: options.input_root,
        project_root,
        output_root: options.output_path ??
          resolve(project_root, default_full_import_output),
        manifest_only: options.manifest_only,
        concurrency: options.concurrency,
      });
      const summary = {
        output_root: result.output_root,
        mode: options.manifest_only ? "manifest_only" : "full",
        ...result.catalog.summary,
        quality: result.report.summary,
        manifest_sha256: result.manifest.manifest_sha256,
      };
      if (options.json) {
        process.stdout.write(serialize_source(summary));
      } else {
        console.log(`诗歌：${summary.hymn_count}`);
        console.log(`幻灯片：${summary.slide_count}`);
        console.log(`Base：${summary.quality.base_usage_count}`);
        console.log(`Accent：${summary.quality.accent_usage_count}`);
        console.log(`无 SimpMusic：${summary.quality.no_simpmusic_count}`);
        console.log(`模式：${summary.mode}`);
        console.log(`产物：${summary.output_root}`);
        console.log(`Manifest SHA-256：${summary.manifest_sha256}`);
      }
    }
    if (!options.json) {
      console.log(
        `字体配置：${font_verification.profile_version} (${font_verification.mapping_version})`,
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

export async function prepare_hymn_pptx_semantic_import(options = {}) {
  return assert_simpmusic_semantic_decoding_ready(options);
}

function parse_arguments(arguments_list) {
  const options = {
    input_root: resolve(project_root, "712首-文字"),
    output_path: undefined,
    json: false,
    scan: false,
    manifest_only: false,
    concurrency: 4,
    help: false,
  };

  for (let index = 0; index < arguments_list.length; index += 1) {
    const argument = arguments_list[index];

    if (argument === "--input") {
      options.input_root = resolve_value(arguments_list, index, argument);
      index += 1;
    } else if (argument === "--output") {
      options.output_path = resolve_value(arguments_list, index, argument);
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--scan") {
      options.scan = true;
    } else if (argument === "--manifest-only") {
      options.manifest_only = true;
    } else if (argument === "--concurrency") {
      options.concurrency = resolve_positive_integer(
        arguments_list,
        index,
        argument,
      );
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }

  return options;
}

function resolve_positive_integer(arguments_list, option_index, option_name) {
  const value = Number(arguments_list[option_index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 32) {
    throw new Error(`${option_name} 必须是 1—32 的整数`);
  }
  return value;
}

function resolve_value(arguments_list, option_index, option_name) {
  const value = arguments_list[option_index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${option_name} 缺少路径参数`);
  }

  return resolve(process.cwd(), value);
}

function print_help() {
  console.log([
    "用法：npm run import:hymns:pptx -- [选项]",
    "",
    "选项：",
    "  --input <目录>   PPTX 输入目录，默认 712首-文字",
    `  --output <路径>  产物目录，默认 ${default_full_import_output}`,
    "  --manifest-only  只写 catalog、quality report 和 manifest",
    "  --concurrency N  并发处理数，默认 4",
    "  --scan           仅执行旧版 OOXML 扫描；此时 --output 是报告文件",
    "  --json           将执行摘要写到标准输出",
    "  -h, --help       显示帮助",
  ].join("\n"));
}
