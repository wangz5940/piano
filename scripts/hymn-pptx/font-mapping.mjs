import { simpmusic_font_profile } from "./font-config.mjs";

export const simpmusic_mapping_entry_schema = Object.freeze({
  schema_version: 1,
  required_fields: Object.freeze([
    "raw_sequence",
    "semantic_token",
    "context",
    "support_status",
  ]),
  contexts: Object.freeze(["score_base", "score_accent"]),
  support_statuses: Object.freeze([
    "supported",
    "needs_review",
    "unsupported",
  ]),
});

const base_mapping_entries = freeze_entries([
  {
    raw_sequence: "^--",
    semantic_token: "unresolved.base_sequence",
    context: "score_base",
    support_status: "needs_review",
  },
  {
    raw_sequence: "qiiU",
    semantic_token: "unresolved.base_sequence",
    context: "score_base",
    support_status: "needs_review",
  },
  {
    raw_sequence: "%-1",
    semantic_token: "unresolved.base_sequence",
    context: "score_base",
    support_status: "needs_review",
  },
]);

const accent_mapping_entries = freeze_entries([
  {
    raw_sequence: "-",
    semantic_token: "unresolved.accent_overlay",
    context: "score_accent",
    support_status: "needs_review",
  },
]);

export const simpmusic_mapping_tables = Object.freeze({
  [simpmusic_font_profile.fonts.base.sha256]: create_mapping_table({
    role: "base",
    entries: base_mapping_entries,
  }),
  [simpmusic_font_profile.fonts.accent.sha256]: create_mapping_table({
    role: "accent",
    entries: accent_mapping_entries,
  }),
});

export function lookup_simpmusic_mapping({
  font_hash,
  raw_sequence,
  context,
}) {
  const table = simpmusic_mapping_tables[font_hash];

  if (!table) {
    const error = new Error(
      `No SimpMusic mapping table is registered for font hash ${font_hash}.`,
    );
    error.code = "SIMPMUSIC_MAPPING_PROFILE_NOT_FOUND";
    error.font_hash = font_hash;
    throw error;
  }

  const normalized_sequence = String(raw_sequence ?? "");
  const entry = table.entries.find((candidate) =>
    candidate.raw_sequence === normalized_sequence &&
    candidate.context === context);

  if (entry) {
    return {
      ...entry,
      known: true,
    };
  }

  return {
    raw_sequence: normalized_sequence,
    semantic_token: "unknown",
    context,
    support_status: "needs_review",
    known: false,
  };
}

function create_mapping_table({ role, entries }) {
  return Object.freeze({
    schema_version: simpmusic_mapping_entry_schema.schema_version,
    mapping_version: simpmusic_font_profile.mapping_version,
    font_role: role,
    font_sha256: simpmusic_font_profile.fonts[role].sha256,
    entries,
  });
}

function freeze_entries(entries) {
  return Object.freeze(entries.map((entry) => {
    validate_mapping_entry(entry);
    return Object.freeze({ ...entry });
  }));
}

function validate_mapping_entry(entry) {
  for (const field of simpmusic_mapping_entry_schema.required_fields) {
    if (typeof entry[field] !== "string" || entry[field].length === 0) {
      throw new TypeError(`SimpMusic mapping entry requires ${field}.`);
    }
  }
  if (!simpmusic_mapping_entry_schema.contexts.includes(entry.context)) {
    throw new TypeError(
      `Unsupported SimpMusic mapping context: ${entry.context}.`,
    );
  }
  if (
    !simpmusic_mapping_entry_schema.support_statuses.includes(
      entry.support_status,
    )
  ) {
    throw new TypeError(
      `Unsupported SimpMusic mapping status: ${entry.support_status}.`,
    );
  }
}
