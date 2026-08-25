import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  build_source_document_artifacts,
  create_pptx_source_document,
  write_source_document_artifacts,
} from "./source-document.mjs";
import {
  hash_serialized_source,
  serialize_source,
} from "./source-serializer.mjs";
import {
  convert_source_layout_to_svg,
  write_source_svg_artifacts,
} from "./source-svg.mjs";
import { scan_hymn_pptx } from "./scanner.mjs";
import {
  decode_simpmusic_source_document,
} from "./semantic-decoder.mjs";

export const full_import_schema_version = 1;
export const default_full_import_output = ".generated/hymn-pptx";

const issue_categories = Object.freeze({
  no_simpmusic: new Set(["no_simpmusic"]),
  unknown_glyph: new Set(["unknown_token", "unknown_glyph"]),
  decode_failure: new Set([
    "missing_meter",
    "incomplete_duration",
    "event_overlap",
    "pitch_ambiguity",
  ]),
});

export async function build_full_hymn_import({
  input_root,
  project_root,
  output_root = resolve(project_root, default_full_import_output),
  manifest_only = false,
  concurrency = 4,
} = {}) {
  if (!project_root) {
    throw new TypeError("build_full_hymn_import requires project_root.");
  }

  const scan = await scan_hymn_pptx({ input_root, project_root });
  const source_state_before = scan.files.map(to_source_state);
  const results = await map_with_concurrency(
    scan.files,
    concurrency,
    (file) => process_hymn(file, {
      manifest_only,
      output_root,
    }),
  );
  const source_state_after = (await scan_hymn_pptx({
    input_root,
    project_root,
  })).files.map(to_source_state);

  if (
    hash_serialized_source(source_state_before) !==
    hash_serialized_source(source_state_after)
  ) {
    throw new Error("PPTX input files changed during the full import.");
  }

  const catalog_entries = results.map((result) => result.catalog_entry);
  const slides = catalog_entries.flatMap((entry) => entry.slides);
  const report = build_quality_report({
    catalog_entries,
    quality_issues_by_hymn: new Map(results.map((result) => [
      result.catalog_entry.hymn_id,
      result.quality_issues,
    ])),
    scan_failures: scan.failures,
  });
  const catalog = {
    schema_version: full_import_schema_version,
    document_type: "hymn_pptx_import_catalog",
    publication_scope: "candidate_only",
    summary: {
      hymn_count: catalog_entries.length,
      slide_count: slides.length,
      status_counts: count_values(
        catalog_entries.map((entry) => entry.status),
      ),
    },
    hymns: catalog_entries,
    slides,
  };
  assert_catalog_invariants(catalog);

  const manifest_seed = {
    schema_version: full_import_schema_version,
    document_type: "hymn_pptx_import_manifest",
    mode: manifest_only ? "manifest_only" : "full",
    catalog_sha256: hash_serialized_source(catalog),
    report_sha256: hash_serialized_source(report),
    source_state_sha256: hash_serialized_source(source_state_before),
    artifact_hashes: results.flatMap((result) => result.artifact_hashes),
  };
  const manifest = {
    ...manifest_seed,
    manifest_sha256: hash_serialized_source(manifest_seed),
  };

  await mkdir(output_root, { recursive: true });
  await Promise.all([
    write_json(resolve(output_root, "catalog.json"), catalog),
    write_json(resolve(output_root, "quality-report.json"), report),
    write_json(resolve(output_root, "manifest.json"), manifest),
  ]);

  return {
    output_root,
    catalog,
    report,
    manifest,
  };
}

async function process_hymn(file, { manifest_only, output_root }) {
  const hymn_output = resolve(output_root, "hymns", file.hymn_id);
  const base_entry = {
    hymn_id: file.hymn_id,
    title: file.title,
    source_id: file.source_id,
    score_id: file.score_id,
    source_file: file.relative_path,
    source_sha256: file.sha256,
    byte_length: file.byte_length,
  };

  try {
    await access(file.absolute_path);
    const source_document = await create_pptx_source_document(file);
    const source_artifacts = build_source_document_artifacts(source_document);
    const decoded = decode_simpmusic_source_document(source_document);
    const score_document = decoded.score_document;
    assert_not_published(score_document, file.hymn_id);
    const slides = source_document.slides.map((slide) => ({
      hymn_id: file.hymn_id,
      source_id: file.source_id,
      slide_index: slide.index,
      presentation_slide_id: slide.presentation_slide_id,
      source_svg_path: null,
      source_svg_sha256: null,
    }));
    const quality_issues = decoded.issues.map(to_quality_issue);
    let source_svg = null;
    try {
      source_svg = convert_source_layout_to_svg(
        source_artifacts.source_layout,
      );
      for (const rendered_slide of source_svg.slides) {
        const slide = slides.find((candidate) =>
          candidate.slide_index === rendered_slide.slide_index);
        if (slide) {
          slide.source_svg_path =
            `hymns/${file.hymn_id}/source-svg/${rendered_slide.file_name}`;
          slide.source_svg_sha256 = sha256_text(rendered_slide.svg);
        }
      }
    } catch (error) {
      quality_issues.push({
        code: "structure_failure",
        severity: "error",
        message: stable_error_message(error),
        source_refs: [],
        raw_data: null,
      });
    }
    const issue_codes = quality_issues.map((issue) => issue.code);
    const status = issue_codes.includes("no_simpmusic")
      ? "validation_failed"
      : issue_codes.includes("structure_failure")
        ? "needs_review"
        : decoded.status;
    const artifact_hashes = [
      artifact_hash(
        `hymns/${file.hymn_id}/source-layout.json`,
        source_artifacts.source_layout_json,
      ),
      artifact_hash(
        `hymns/${file.hymn_id}/provenance.json`,
        source_artifacts.provenance_json,
      ),
      ...slides.filter((slide) => slide.source_svg_sha256).map((slide) => ({
        path: slide.source_svg_path,
        sha256: slide.source_svg_sha256,
      })),
      artifact_hash(
        `hymns/${file.hymn_id}/issues.json`,
        serialize_source(quality_issues),
      ),
    ];

    if (score_document) {
      artifact_hashes.push(artifact_hash(
        `hymns/${file.hymn_id}/score-document.candidate.json`,
        serialize_source(score_document),
      ));
    }

    if (!manifest_only) {
      await Promise.all([
        write_source_document_artifacts(hymn_output, source_document),
        source_svg
          ? write_source_svg_artifacts(
              resolve(hymn_output, "source-svg"),
              source_artifacts.source_layout,
              { review_scope: "controlled_review" },
            )
          : Promise.resolve(),
        write_json(resolve(hymn_output, "issues.json"), quality_issues),
        score_document
          ? write_json(
              resolve(hymn_output, "score-document.candidate.json"),
              score_document,
            )
          : Promise.resolve(),
      ]);
    }

    return {
      catalog_entry: {
        ...base_entry,
        status,
        slide_count: slides.length,
        slides,
        issue_count: quality_issues.length,
        issue_codes: [...new Set(issue_codes)].sort(),
        ...count_font_usage(source_document),
        score_document_path: score_document
          ? `hymns/${file.hymn_id}/score-document.candidate.json`
          : null,
      },
      artifact_hashes,
      quality_issues,
    };
  } catch (error) {
    const quality_issues = [{
      code: "structure_failure",
      severity: "error",
      message: stable_error_message(error),
      source_refs: [],
      raw_data: null,
    }];
    return {
      catalog_entry: {
        ...base_entry,
        status: "validation_failed",
        slide_count: 0,
        slides: [],
        issue_count: 1,
        issue_codes: ["structure_failure"],
        uses_simpmusic_base: false,
        uses_simpmusic_accent: false,
        score_document_path: null,
        error: stable_error_message(error),
      },
      artifact_hashes: [],
      quality_issues,
    };
  }
}

function build_quality_report({
  catalog_entries,
  quality_issues_by_hymn,
  scan_failures,
}) {
  const by_category = {
    no_simpmusic: [],
    unknown_glyph: [],
    decode_failure: [],
    structure_failure: scan_failures.map((failure) => ({
      hymn_id: failure.hymn_id ?? null,
      source_file: failure.relative_path,
      issue_codes: [failure.reason],
    })),
  };

  for (const entry of catalog_entries) {
    const issue_code_set = new Set(entry.issue_codes);
    for (const [category, codes] of Object.entries(issue_categories)) {
      if ([...codes].some((code) => issue_code_set.has(code))) {
        by_category[category].push(to_report_entry(
          entry,
          quality_issues_by_hymn.get(entry.hymn_id) ?? [],
          codes,
        ));
      }
    }
    if (issue_code_set.has("structure_failure")) {
      by_category.structure_failure.push(to_report_entry(
        entry,
        quality_issues_by_hymn.get(entry.hymn_id) ?? [],
        new Set(["structure_failure"]),
      ));
    }
  }

  return {
    schema_version: full_import_schema_version,
    document_type: "hymn_pptx_import_quality_report",
    summary: {
      hymn_count: catalog_entries.length,
      slide_count: catalog_entries.reduce(
        (total, entry) => total + entry.slide_count,
        0,
      ),
      base_usage_count: catalog_entries.filter((entry) =>
        entry.uses_simpmusic_base).length,
      accent_usage_count: catalog_entries.filter((entry) =>
        entry.uses_simpmusic_accent).length,
      no_simpmusic_count: by_category.no_simpmusic.length,
      unknown_glyph_hymn_count: by_category.unknown_glyph.length,
      decode_failure_hymn_count: by_category.decode_failure.length,
      structure_failure_count: by_category.structure_failure.length,
      status_counts: count_values(
        catalog_entries.map((entry) => entry.status),
      ),
    },
    categories: by_category,
  };
}

function to_report_entry(entry, quality_issues, category_codes) {
  return {
    hymn_id: entry.hymn_id,
    source_file: entry.source_file,
    status: entry.status,
    issues: compact_quality_issues(
      quality_issues.filter((issue) => category_codes.has(issue.code)),
    ),
    error: entry.error ?? null,
  };
}

function compact_quality_issues(issues) {
  const grouped = new Map();
  for (const issue of issues) {
    const raw_sequence = issue.raw_data?.raw_sequence ?? null;
    const key = `${issue.code}\u0000${raw_sequence ?? ""}\u0000${
      issue.message
    }`;
    const current = grouped.get(key) ?? {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      raw_sequence,
      source_refs: [],
    };
    current.source_refs.push(...issue.source_refs);
    grouped.set(key, current);
  }
  return [...grouped.values()].map((issue) => ({
    ...issue,
    source_refs: unique_source_refs(issue.source_refs),
  }));
}

function unique_source_refs(source_refs) {
  const by_key = new Map();
  for (const source_ref of source_refs) {
    const key = [
      source_ref.slide_number,
      source_ref.shape_id,
      source_ref.paragraph_index,
      source_ref.run_index,
    ].join(":");
    by_key.set(key, source_ref);
  }
  return [...by_key.values()];
}

function to_quality_issue(issue) {
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    source_refs: issue.source_refs ?? [],
    raw_data: issue.raw_data ?? null,
  };
}

function count_font_usage(source_document) {
  const classifications = source_document.slides.flatMap((slide) =>
    slide.shapes.flatMap((shape) =>
      shape.paragraphs.flatMap((paragraph) =>
        paragraph.runs.map((run) => run.classification))));
  return {
    uses_simpmusic_base: classifications.includes("score_base"),
    uses_simpmusic_accent: classifications.includes("score_accent"),
  };
}

function assert_catalog_invariants(catalog) {
  const hymn_ids = catalog.hymns.map((entry) => entry.hymn_id);
  const source_ids = catalog.hymns.map((entry) => entry.source_id);
  const score_ids = catalog.hymns.map((entry) => entry.score_id);
  for (const [label, values] of [
    ["hymn_id", hymn_ids],
    ["source_id", source_ids],
    ["score_id", score_ids],
  ]) {
    if (new Set(values).size !== values.length) {
      throw new Error(`Full import contains duplicate ${label}.`);
    }
  }
  if (catalog.hymns.some((entry) => entry.status === "published")) {
    throw new Error("Full import must not create published entries.");
  }
}

function assert_not_published(document, hymn_id) {
  if (
    document?.status === "published" ||
    document?.review?.published_at ||
    document?.review?.published_by
  ) {
    throw new Error(`Candidate ${hymn_id} unexpectedly became published.`);
  }
}

async function map_with_concurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next_index = 0;
  const worker_count = Math.min(
    Math.max(1, Number(concurrency) || 1),
    Math.max(values.length, 1),
  );
  await Promise.all(Array.from({ length: worker_count }, async () => {
    while (next_index < values.length) {
      const index = next_index;
      next_index += 1;
      results[index] = await mapper(values[index], index);
    }
  }));
  return results;
}

function to_source_state(file) {
  return {
    relative_path: file.relative_path,
    byte_length: file.byte_length,
    sha256: file.sha256,
  };
}

function count_values(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function artifact_hash(path, content) {
  return { path, sha256: sha256_text(content) };
}

function sha256_text(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function stable_error_message(error) {
  return error instanceof Error ? error.message : String(error);
}

async function write_json(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, serialize_source(value), {
    encoding: "utf8",
    flag: "w",
  });
}
