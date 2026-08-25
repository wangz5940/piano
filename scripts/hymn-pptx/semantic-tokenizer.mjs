import {
  simpmusic_font_profile,
} from "./font-config.mjs";
import {
  simpmusic_mapping_tables,
} from "./font-mapping.mjs";

const duration_names = Object.freeze({
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirty_second: 0.125,
  sixty_fourth: 0.0625,
});

export function decode_simpmusic_run({
  run,
  shape,
  paragraph_offset,
  paragraph_length,
  token_id_prefix,
  font_role,
  mapping_tables = simpmusic_mapping_tables,
  on_issue = () => {},
}) {
  const context = font_role === "accent"
    ? "score_accent"
    : "score_base";
  const table = get_mapping_table(mapping_tables, font_role);
  const entries = [...table.entries]
    .filter((entry) => entry.context === context)
    .sort(compare_mapping_entries);
  const text = String(run.raw_text ?? "");
  const tokens = [];
  let offset = 0;

  while (offset < text.length) {
    const matched_entry = entries.find((entry) =>
      text.startsWith(entry.raw_sequence, offset));

    if (matched_entry) {
      const token = create_mapped_token({
        entry: matched_entry,
        run,
        shape,
        paragraph_offset: paragraph_offset + offset,
        paragraph_length,
        token_id: `${token_id_prefix}-t${pad(tokens.length + 1, 3)}`,
      });
      tokens.push(token);
      if (
        token.kind === "unresolved" ||
        token.support_status !== "supported"
      ) {
        on_issue(create_token_issue({
          code: "unresolved_token",
          message:
            `SimpMusic ${font_role} sequence is mapped but requires review.`,
          token,
        }));
      }
      offset += matched_entry.raw_sequence.length;
      continue;
    }

    const code_point = text.codePointAt(offset);
    const raw_character = String.fromCodePoint(code_point);
    if (/^\s$/u.test(raw_character)) {
      const whitespace_end = find_whitespace_end(text, offset);
      tokens.push(create_layout_token({
        raw_sequence: text.slice(offset, whitespace_end),
        run,
        shape,
        paragraph_offset: paragraph_offset + offset,
        paragraph_length,
        token_id: `${token_id_prefix}-t${pad(tokens.length + 1, 3)}`,
      }));
      offset = whitespace_end;
      continue;
    }

    const unknown_end = find_unknown_end(text, offset, entries);
    const token = create_unknown_token({
      raw_sequence: text.slice(offset, unknown_end),
      run,
      shape,
      paragraph_offset: paragraph_offset + offset,
      paragraph_length,
      token_id: `${token_id_prefix}-t${pad(tokens.length + 1, 3)}`,
      context,
    });
    tokens.push(token);
    on_issue(create_token_issue({
      code: "unknown_token",
      message:
        `Unknown SimpMusic ${font_role} sequence was preserved for review.`,
      token,
    }));
    offset = unknown_end;
  }

  return tokens;
}

export function parse_semantic_token(semantic_token) {
  const normalized = String(semantic_token ?? "").trim().toLowerCase();
  const parts = normalized.split(/[.:]/u).filter(Boolean);

  if (normalized === "unknown") {
    return { kind: "unknown" };
  }
  if (parts[0] === "unresolved") {
    return { kind: "unresolved" };
  }

  const degree_index = parts[0] === "pitch" && parts[1] === "degree"
    ? 2
    : parts[0] === "degree"
      ? 1
      : -1;
  if (degree_index >= 0) {
    const degree = Number(parts[degree_index]);
    if (Number.isInteger(degree) && degree >= 1 && degree <= 7) {
      return { kind: "degree", degree };
    }
  }

  if (parts[0] === "accidental") {
    const accidental = parts.slice(1).join("_");
    if (
      [
        "sharp",
        "flat",
        "natural",
        "double_sharp",
        "double_flat",
      ].includes(accidental)
    ) {
      return { kind: "accidental", accidental };
    }
  }

  if (parts[0] === "octave") {
    const direction = parts[1];
    const count = parse_positive_number(parts[2], 1);
    if (direction === "up" || direction === "down") {
      return {
        kind: "octave",
        octave_offset: (direction === "up" ? 1 : -1) * count,
      };
    }
    const octave_offset = Number(parts[1]);
    if (Number.isInteger(octave_offset)) {
      return { kind: "octave", octave_offset };
    }
  }

  if (parts[0] === "duration") {
    const duration_beats = parse_duration(parts.slice(1));
    if (duration_beats !== null) {
      return { kind: "duration", duration_beats };
    }
  }

  if (parts[0] === "rest") {
    const duration_beats = parse_duration(parts.slice(1));
    return {
      kind: "rest",
      duration_beats: duration_beats ?? 1,
    };
  }

  if (parts[0] === "barline") {
    return {
      kind: "barline",
      barline: parts.slice(1).join("_") || "single",
    };
  }

  if (parts[0] === "sustain") {
    const duration_beats = parts[1] === "beat"
      ? parse_positive_number(parts[2], 1)
      : parse_duration(parts.slice(1)) ?? 1;
    return { kind: "sustain", duration_beats };
  }

  if (parts[0] === "tie") {
    const tie = parts[1] || "continue";
    if (["start", "continue", "stop"].includes(tie)) {
      return { kind: "tie", tie };
    }
  }

  if (parts[0] === "onset") {
    const onset_beats = parts[1] === "beats"
      ? Number(parts[2])
      : Number(parts[1]);
    if (Number.isFinite(onset_beats) && onset_beats >= 0) {
      return { kind: "onset", onset_beats };
    }
  }

  if (
    normalized === "augmentation_dot" ||
    normalized === "duration.dot"
  ) {
    return { kind: "augmentation_dot" };
  }

  return { kind: "other" };
}

export function to_score_source_ref(source) {
  return {
    slide_number: source.slide_index,
    shape_id: String(source.shape_id),
    paragraph_index: source.paragraph_index ?? null,
    run_index: source.run_index ?? null,
  };
}

export function unique_source_refs(references) {
  const seen = new Set();
  const result = [];

  for (const reference of references) {
    if (!reference?.shape_id || !Number.isInteger(reference.slide_number)) {
      continue;
    }
    const key = [
      reference.slide_number,
      reference.shape_id,
      reference.paragraph_index,
      reference.run_index,
    ].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(reference);
    }
  }
  return result;
}

function create_mapped_token({
  entry,
  run,
  shape,
  paragraph_offset,
  paragraph_length,
  token_id,
}) {
  const parsed_semantic = parse_semantic_token(entry.semantic_token);
  const source_refs = [to_score_source_ref(run.source)];

  return {
    id: token_id,
    ...parsed_semantic,
    semantic_token: entry.semantic_token,
    raw_sequence: entry.raw_sequence,
    raw_range: {
      start: paragraph_offset,
      end: paragraph_offset + entry.raw_sequence.length,
    },
    known: true,
    support_status: entry.support_status,
    status: entry.support_status === "supported"
      ? "candidate"
      : "needs_review",
    source_refs,
    geometry: estimate_token_geometry({
      shape_geometry: shape.geometry,
      start: paragraph_offset,
      end: paragraph_offset + entry.raw_sequence.length,
      paragraph_length,
    }),
    accents: [],
  };
}

function create_layout_token({
  raw_sequence,
  run,
  shape,
  paragraph_offset,
  paragraph_length,
  token_id,
}) {
  return {
    id: token_id,
    kind: "spacing",
    semantic_token: "layout.spacing",
    raw_sequence,
    raw_range: {
      start: paragraph_offset,
      end: paragraph_offset + raw_sequence.length,
    },
    known: true,
    support_status: "supported",
    status: "candidate",
    source_refs: [to_score_source_ref(run.source)],
    geometry: estimate_token_geometry({
      shape_geometry: shape.geometry,
      start: paragraph_offset,
      end: paragraph_offset + raw_sequence.length,
      paragraph_length,
    }),
    accents: [],
  };
}

function create_unknown_token({
  raw_sequence,
  run,
  shape,
  paragraph_offset,
  paragraph_length,
  token_id,
  context,
}) {
  return {
    id: token_id,
    kind: "unknown",
    semantic_token: "unknown",
    raw_sequence,
    raw_range: {
      start: paragraph_offset,
      end: paragraph_offset + raw_sequence.length,
    },
    known: false,
    context,
    support_status: "needs_review",
    status: "needs_review",
    source_refs: [to_score_source_ref(run.source)],
    geometry: estimate_token_geometry({
      shape_geometry: shape.geometry,
      start: paragraph_offset,
      end: paragraph_offset + raw_sequence.length,
      paragraph_length,
    }),
    accents: [],
  };
}

function create_token_issue({ code, message, token }) {
  return {
    code,
    severity: "warning",
    message,
    raw_sequence: token.raw_sequence,
    source_refs: token.source_refs,
    geometry: token.geometry,
  };
}

function get_mapping_table(mapping_tables, font_role) {
  const font_hash = simpmusic_font_profile.fonts[font_role].sha256;
  const table = mapping_tables[font_hash];

  if (!table || !Array.isArray(table.entries)) {
    const error = new Error(
      `No valid SimpMusic ${font_role} mapping table is registered.`,
    );
    error.code = "SIMPMUSIC_MAPPING_PROFILE_NOT_FOUND";
    error.font_hash = font_hash;
    throw error;
  }
  return table;
}

function compare_mapping_entries(left, right) {
  return (
    right.raw_sequence.length - left.raw_sequence.length ||
    left.raw_sequence.localeCompare(right.raw_sequence)
  );
}

function find_whitespace_end(text, start) {
  let end = start;
  while (end < text.length) {
    const code_point = text.codePointAt(end);
    const character = String.fromCodePoint(code_point);
    if (!/^\s$/u.test(character)) {
      break;
    }
    end += character.length;
  }
  return end;
}

function find_unknown_end(text, start, entries) {
  let end = start;

  while (end < text.length) {
    if (end > start && entries.some((entry) =>
      text.startsWith(entry.raw_sequence, end))) {
      break;
    }
    const code_point = text.codePointAt(end);
    const character = String.fromCodePoint(code_point);
    if (/^\s$/u.test(character)) {
      break;
    }
    end += character.length;
  }
  return end;
}

function estimate_token_geometry({
  shape_geometry,
  start,
  end,
  paragraph_length,
}) {
  if (
    !Number.isFinite(shape_geometry?.x) ||
    !Number.isFinite(shape_geometry?.y) ||
    !Number.isFinite(shape_geometry?.cx) ||
    !Number.isFinite(shape_geometry?.cy)
  ) {
    return null;
  }

  const length = Math.max(1, paragraph_length);
  const x = shape_geometry.x + shape_geometry.cx * start / length;
  const right = shape_geometry.x + shape_geometry.cx * end / length;
  return {
    x,
    y: shape_geometry.y,
    cx: Math.max(1, right - x),
    cy: shape_geometry.cy,
  };
}

function parse_duration(parts) {
  if (parts.length === 0) {
    return null;
  }
  const joined_name = parts.join("_");
  if (duration_names[joined_name] !== undefined) {
    return duration_names[joined_name];
  }
  if (parts[0] === "beats") {
    return parse_positive_number(parts[1], null);
  }
  return parse_positive_number(parts[0], null);
}

function parse_positive_number(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}
