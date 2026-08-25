function clone_document(document) {
  return structuredClone(document);
}

function legacy_annotation(reason, options, document_status) {
  const confirmed = document_status === "published";
  return {
    source: "legacy",
    status: confirmed ? "confirmed" : "needs_review",
    reason,
    confirmed_by: confirmed ? options.reviewed_by ?? options.published_by ?? null : null,
    confirmed_at: confirmed ? options.reviewed_at ?? options.published_at ?? null : null,
    source_refs: [],
  };
}

export function migrate_score_document(document, options = {}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("ScoreDocument must be an object");
  }
  if (document.schema_version === 2) {
    return clone_document(document);
  }
  if (document.schema_version !== 1) {
    throw new Error("Unsupported ScoreDocument schema version");
  }

  const document_status = options.document_status ?? "needs_review";
  const measures = Array.isArray(document.measures)
    ? document.measures.map((measure) => ({
        ...measure,
        meter: { ...measure.meter },
        events: Array.isArray(measure.events)
          ? measure.events.map((event) => {
              const migrated_event = {
                ...event,
                notes: Array.isArray(event.notes)
                  ? event.notes.map((note) => {
                      const migrated_note = { ...note };
                      if (note.finger !== undefined) {
                        migrated_note.fingering = legacy_annotation(
                          "Preserved from ScoreDocument v1 fingering",
                          options,
                          document_status,
                        );
                      }
                      return migrated_note;
                    })
                  : [],
              };
              if (event.chord !== undefined) {
                migrated_event.chord_annotation = legacy_annotation(
                  "Preserved from ScoreDocument v1 chord",
                  options,
                  document_status,
                );
              }
              return migrated_event;
            })
          : [],
      }))
    : [];

  return {
    schema_version: 2,
    id: document.id,
    number: null,
    title: document.title,
    key_signature: document.key_signature,
    tonic_midi: document.tonic_midi,
    time_signature: document.time_signature,
    status: document_status,
    provenance: {
      kind: "legacy",
      source_id: null,
      source_file: null,
      source_sha256: options.source_sha256 ?? null,
      font_config_version: null,
      importer_version: null,
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures,
    review: {
      reviewed_by: options.reviewed_by ?? null,
      reviewed_at: options.reviewed_at ?? null,
      published_by: options.published_by ?? null,
      published_at: options.published_at ?? null,
      note: "Migrated from ScoreDocument v1",
    },
  };
}
