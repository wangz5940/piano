import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const default_project_root = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

export const default_hymn_pptx_input_root = resolve(
  default_project_root,
  "712首-文字",
);

export async function scan_hymn_pptx({
  input_root = default_hymn_pptx_input_root,
  project_root = default_project_root,
} = {}) {
  const directory_entries = await readdir(input_root, { withFileTypes: true });
  const pptx_entries = directory_entries
    .filter((entry) =>
      entry.isFile() && entry.name.toLowerCase().endsWith(".pptx"))
    .sort((left, right) => compare_names(left.name, right.name));
  const candidates = await Promise.all(
    pptx_entries.map((entry) =>
      inspect_candidate(entry.name, input_root, project_root)),
  );
  const id_counts = count_hymn_ids(candidates);
  const files = [];
  const failures = [];

  for (const candidate of candidates) {
    if (!candidate.hymn_id || !candidate.title) {
      failures.push({
        ...candidate,
        reason: "invalid_file_name",
      });
      continue;
    }

    if (id_counts.get(candidate.hymn_id) !== 1) {
      failures.push({
        ...candidate,
        reason: "duplicate_hymn_id",
      });
      continue;
    }

    files.push({
      ...candidate,
      source_id: `hymn-pptx-${candidate.hymn_id}`,
      score_id: `hymn-${candidate.hymn_id}`,
    });
  }

  return {
    input_root,
    discovered_file_count: pptx_entries.length,
    files,
    failures,
  };
}

export async function sha256_file(file_path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(file_path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function inspect_candidate(file_name, input_root, project_root) {
  const absolute_path = resolve(input_root, file_name);
  const file_stat = await stat(absolute_path);
  const parsed_name = parse_hymn_file_name(file_name);

  return {
    hymn_id: parsed_name?.hymn_id,
    title: parsed_name?.title,
    file_name,
    relative_path: to_posix_path(relative(project_root, absolute_path)),
    absolute_path,
    byte_length: file_stat.size,
    sha256: await sha256_file(absolute_path),
  };
}

function parse_hymn_file_name(file_name) {
  const match = file_name.match(
    /^(?<hymn_id>\d{3})\s+(?<title>.+)\.pptx$/iu,
  );
  const title = match?.groups?.title.trim();

  if (!match?.groups?.hymn_id || !title) {
    return undefined;
  }

  return {
    hymn_id: match.groups.hymn_id,
    title,
  };
}

function count_hymn_ids(candidates) {
  const counts = new Map();

  for (const candidate of candidates) {
    if (!candidate.hymn_id) {
      continue;
    }
    counts.set(candidate.hymn_id, (counts.get(candidate.hymn_id) ?? 0) + 1);
  }

  return counts;
}

function compare_names(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function to_posix_path(file_path) {
  return file_path.split(sep).join("/");
}
