import {
  unique_source_refs,
} from "./semantic-tokenizer.mjs";
import {
  apply_teaching_analysis,
} from "./teaching-analysis.mjs";

const major_scale_intervals = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const accidental_offsets = Object.freeze({
  double_flat: -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  double_sharp: 2,
});

export function create_score_document_candidate({
  source_document,
  base_streams,
  lyric_phrases,
  metadata,
  add_issue,
  importer_version,
}) {
  const event_context = build_measure_events({
    source_document,
    base_streams,
    metadata,
    add_issue,
  });
  const lyrics = associate_lyrics({
    lyric_phrases,
    base_streams,
    event_context,
    add_issue,
  });
  const provenance_references = unique_source_refs([
    ...base_streams.flatMap((stream) => stream.source_refs),
    ...lyric_phrases.flatMap((phrase) => phrase.source_refs),
  ]);

  const score_document = apply_teaching_analysis({
    schema_version: 2,
    id: normalize_identifier(source_document.score_id, "hymn-score"),
    number: source_document.hymn_id ?? null,
    title: source_document.title,
    key_signature: metadata.key_signature ?? "unknown",
    tonic_midi: metadata.tonic_midi ?? 60,
    time_signature: metadata.time_signature ?? "unknown",
    status: "candidate",
    provenance: {
      kind: "pptx",
      source_id: normalize_identifier(
        source_document.source_id,
        "hymn-pptx-source",
      ),
      source_file:
        source_document.provenance.source_file ??
        source_document.provenance.source_file_name,
      source_sha256: source_document.provenance.source_sha256,
      font_config_version:
        source_document.provenance.font_config_version,
      importer_version,
      references: provenance_references,
    },
    lyrics,
    hand_positions: [],
    measures: event_context.measures,
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: null,
      published_at: null,
      note: "Generated from SimpMusic semantic tokens; requires source review.",
    },
  });

  return {
    score_document,
    event_ids_by_stream: event_context.event_ids_by_stream,
  };
}

function build_measure_events({
  source_document,
  base_streams,
  metadata,
  add_issue,
}) {
  const expected_meter = metadata.meter;
  const fallback_meter = { beats: 4, beat_unit: 4 };
  const score_id = normalize_identifier(source_document.score_id, "hymn-score");
  const measures = [];
  const event_ids_by_stream = new Map();
  const event_positions = new Map();
  let current_events = [];
  let current_onset = 0;
  let explicit_onset = null;
  let pending_duration = null;
  let pending_accidental = null;
  let pending_octave = 0;
  let event_sequence = 0;
  let note_sequence = 0;
  let current_event = null;
  let current_stream_id = null;

  const finalize_measure = (source_refs = []) => {
    if (current_events.length === 0) {
      current_onset = 0;
      explicit_onset = null;
      current_event = null;
      return;
    }

    const measure_number = measures.length + 1;
    const measure_id = `${score_id}-m${pad(measure_number, 4)}`;
    const actual_duration = current_events.reduce(
      (maximum, event) =>
        Math.max(maximum, event.onset_beats + event.duration_beats),
      0,
    );
    const meter = expected_meter
      ? {
          beats: Math.max(expected_meter.beats, actual_duration),
          beat_unit: expected_meter.beat_unit,
        }
      : {
          beats: Math.max(fallback_meter.beats, actual_duration),
          beat_unit: fallback_meter.beat_unit,
        };

    if (
      expected_meter &&
      Math.abs(actual_duration - expected_meter.beats) > 0.0001
    ) {
      add_issue({
        code: "incomplete_duration",
        severity: "warning",
        message:
          `Measure ${measure_number} totals ${actual_duration} beats; ` +
          `${expected_meter.beats} were expected.`,
        source_refs: unique_source_refs([
          ...source_refs,
          ...current_events.flatMap((event) => event.source_refs),
        ]),
      });
    }

    const events = current_events.map((event) => {
      event_positions.set(event.id, {
        measure_id,
        onset_beats: event.onset_beats,
        duration_beats: event.duration_beats,
      });
      return event;
    });
    measures.push({
      id: measure_id,
      number: String(measure_number),
      meter,
      events,
    });
    report_event_overlaps(events, measure_id, add_issue);

    current_events = [];
    current_onset = 0;
    explicit_onset = null;
    current_event = null;
  };

  for (const stream of base_streams) {
    current_stream_id = stream.id;
    if (!event_ids_by_stream.has(stream.id)) {
      event_ids_by_stream.set(stream.id, []);
    }

    for (const token of stream.tokens) {
      if (
        token.support_status !== "supported" ||
        ["unknown", "unresolved", "spacing", "other"].includes(token.kind)
      ) {
        continue;
      }

      if (token.kind === "duration") {
        pending_duration = token.duration_beats;
        continue;
      }
      if (token.kind === "accidental") {
        pending_accidental = token;
        continue;
      }
      if (token.kind === "octave") {
        pending_octave += token.octave_offset;
        continue;
      }
      if (token.kind === "onset") {
        explicit_onset = token.onset_beats;
        continue;
      }
      if (token.kind === "barline") {
        finalize_measure(token.source_refs);
        continue;
      }
      if (token.kind === "sustain") {
        if (current_event) {
          current_event.duration_beats += token.duration_beats;
          current_event.sustain = true;
          current_event.source_refs = unique_source_refs([
            ...current_event.source_refs,
            ...token.source_refs,
          ]);
          current_onset = Math.max(
            current_onset,
            current_event.onset_beats + current_event.duration_beats,
          );
        }
        continue;
      }
      if (token.kind === "augmentation_dot") {
        if (current_event) {
          current_event.duration_beats *= 1.5;
          current_event.source_refs = unique_source_refs([
            ...current_event.source_refs,
            ...token.source_refs,
          ]);
          current_onset = Math.max(
            current_onset,
            current_event.onset_beats + current_event.duration_beats,
          );
        }
        continue;
      }
      if (token.kind === "tie") {
        if (current_event) {
          current_event.tie = token.tie;
          current_event.source_refs = unique_source_refs([
            ...current_event.source_refs,
            ...token.source_refs,
          ]);
        }
        continue;
      }
      if (token.kind !== "degree" && token.kind !== "rest") {
        continue;
      }

      event_sequence += 1;
      const event_id = `${score_id}-e${pad(event_sequence, 6)}`;
      const onset_beats = explicit_onset ?? current_onset;
      const duration_beats =
        pending_duration ??
        token.duration_beats ??
        1;
      const modifier_refs = [
        ...(pending_accidental?.source_refs ?? []),
        ...token.source_refs,
        ...token.accents.flatMap((accent) => accent.source_refs),
      ];
      const event = {
        id: event_id,
        onset_beats,
        duration_beats,
        hand: "right",
        voice: 1,
        notes: [],
        source_refs: unique_source_refs(modifier_refs),
      };

      if (token.kind === "degree") {
        note_sequence += 1;
        const midi = resolve_degree_midi({
          degree: token.degree,
          tonic_midi: metadata.tonic_midi,
          octave_offset: pending_octave,
          accidental: pending_accidental?.accidental,
          token,
          add_issue,
        });
        event.notes.push({
          id: `${score_id}-n${pad(note_sequence, 6)}`,
          midi,
          source_refs: unique_source_refs(modifier_refs),
        });
      }

      current_events.push(event);
      event_ids_by_stream.get(current_stream_id).push(event_id);
      current_event = event;
      current_onset = Math.max(
        current_onset,
        onset_beats + duration_beats,
      );
      explicit_onset = null;
      pending_duration = null;
      pending_accidental = null;
      pending_octave = 0;
    }

    if (pending_accidental || pending_octave !== 0) {
      add_issue({
        code: "pitch_ambiguity",
        severity: "warning",
        message:
          "Pitch modifier could not be associated with a supported degree.",
        source_refs: unique_source_refs([
          ...(pending_accidental?.source_refs ?? []),
          ...stream.source_refs,
        ]),
      });
      pending_accidental = null;
      pending_octave = 0;
    }
  }
  finalize_measure();

  if (measures.length === 0) {
    measures.push({
      id: `${score_id}-m0001`,
      number: "1",
      meter: { ...(expected_meter ?? fallback_meter) },
      events: [],
    });
  }

  return {
    measures,
    event_ids_by_stream,
    event_positions,
  };
}

function resolve_degree_midi({
  degree,
  tonic_midi,
  octave_offset,
  accidental,
  token,
  add_issue,
}) {
  if (tonic_midi === null || tonic_midi === undefined) {
    add_issue({
      code: "pitch_ambiguity",
      severity: "warning",
      message:
        `Degree ${degree} has no source tonic; C4 is retained as a review placeholder.`,
      source_refs: token.source_refs,
    });
  }

  const resolved_tonic = tonic_midi ?? 60;
  const accidental_offset = accidental_offsets[accidental] ?? 0;
  const unresolved_midi =
    resolved_tonic +
    major_scale_intervals[degree - 1] +
    octave_offset * 12 +
    accidental_offset;

  if (unresolved_midi < 21 || unresolved_midi > 108) {
    add_issue({
      code: "pitch_ambiguity",
      severity: "warning",
      message:
        `Resolved MIDI ${unresolved_midi} is outside the supported piano range.`,
      source_refs: token.source_refs,
    });
  }
  return Math.max(21, Math.min(108, unresolved_midi));
}

function report_event_overlaps(events, measure_id, add_issue) {
  const events_by_voice = new Map();

  for (const event of events) {
    const key = `${event.hand}:${event.voice}`;
    if (!events_by_voice.has(key)) {
      events_by_voice.set(key, []);
    }
    events_by_voice.get(key).push(event);
  }

  for (const voice_events of events_by_voice.values()) {
    voice_events.sort((left, right) =>
      left.onset_beats - right.onset_beats ||
      left.id.localeCompare(right.id));
    let previous = null;

    for (const event of voice_events) {
      if (
        previous &&
        event.onset_beats <
          previous.onset_beats + previous.duration_beats - 0.0001
      ) {
        add_issue({
          code: "event_overlap",
          severity: "warning",
          message:
            `Events ${previous.id} and ${event.id} overlap in ${measure_id}.`,
          source_refs: unique_source_refs([
            ...previous.source_refs,
            ...event.source_refs,
          ]),
        });
      }
      if (
        !previous ||
        event.onset_beats + event.duration_beats >
          previous.onset_beats + previous.duration_beats
      ) {
        previous = event;
      }
    }
  }
}

function associate_lyrics({
  lyric_phrases,
  base_streams,
  event_context,
  add_issue,
}) {
  const streams_by_slide = group_by(
    base_streams,
    (stream) => stream.slide_number,
  );
  const phrases_by_slide = group_by(
    lyric_phrases,
    (phrase) => phrase.slide_number,
  );
  const lyrics = [];

  for (const [slide_number, phrases] of phrases_by_slide) {
    const streams = streams_by_slide.get(slide_number) ?? [];

    phrases.forEach((phrase, phrase_index) => {
      const target_stream = select_phrase_stream(
        streams,
        phrases.length,
        phrase_index,
      );
      const candidate_event_ids = target_stream
        ? event_context.event_ids_by_stream.get(target_stream.id) ?? []
        : [];
      const note_event_ids = candidate_event_ids.filter((event_id) =>
        find_event(event_context.measures, event_id)?.notes.length > 0);
      const syllable_count = count_lyric_syllables(phrase.text);
      const note_aligned =
        syllable_count > 0 &&
        syllable_count === note_event_ids.length;
      const range = target_stream
        ? create_stream_range(
            candidate_event_ids,
            event_context.event_positions,
          )
        : null;

      if (!note_aligned) {
        add_issue({
          code: "lyrics_not_note_aligned",
          severity: "warning",
          message:
            `Lyric phrase ${phrase.id} remains associated at phrase level.`,
          source_refs: phrase.source_refs,
        });
      }

      lyrics.push({
        id: phrase.id,
        stanza_number: phrase.stanza_number,
        text: phrase.text,
        language: /\p{Script=Han}/u.test(phrase.text) ? "zh-CN" : null,
        event_ids: note_aligned ? note_event_ids : [],
        range,
        slide_number,
        annotation: {
          source: "pptx",
          status: note_aligned ? "candidate" : "needs_review",
          reason: note_aligned
            ? "Lyric character count matches the associated note sequence."
            : "Source phrase is preserved without forced note alignment.",
          confirmed_by: null,
          confirmed_at: null,
          source_refs: phrase.source_refs,
        },
      });
    });
  }
  return lyrics;
}

function select_phrase_stream(streams, phrase_count, phrase_index) {
  if (streams.length === 0) {
    return null;
  }
  if (streams.length === phrase_count) {
    return streams[phrase_index];
  }
  const proportional_index = Math.min(
    streams.length - 1,
    Math.floor(phrase_index * streams.length / phrase_count),
  );
  return streams[proportional_index];
}

function create_stream_range(event_ids, event_positions) {
  const positions = event_ids
    .map((event_id) => event_positions.get(event_id))
    .filter(Boolean);
  if (positions.length === 0) {
    return null;
  }
  const first = positions[0];
  const last = positions.at(-1);
  return {
    start: {
      measure_id: first.measure_id,
      beat: first.onset_beats,
    },
    end: {
      measure_id: last.measure_id,
      beat: last.onset_beats + last.duration_beats,
    },
  };
}

function find_event(measures, event_id) {
  for (const measure of measures) {
    const event = measure.events.find((candidate) =>
      candidate.id === event_id);
    if (event) {
      return event;
    }
  }
  return null;
}

function count_lyric_syllables(text) {
  return [...text].filter((character) =>
    /[\p{L}\p{N}]/u.test(character)).length;
}

function group_by(values, key_for_value) {
  const grouped = new Map();
  for (const value of values) {
    const key = key_for_value(value);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(value);
  }
  return grouped;
}

function normalize_identifier(value, fallback) {
  const normalized = String(value ?? "")
    .replace(/[^A-Za-z0-9._:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || fallback;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}
