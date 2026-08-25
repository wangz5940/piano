import {
  simpmusic_font_profile,
} from "./font-config.mjs";
import {
  simpmusic_mapping_tables,
} from "./font-mapping.mjs";
import {
  create_score_document_candidate as build_score_document_candidate,
} from "./score-candidate.mjs";
import {
  parse_semantic_token as parse_candidate_token,
} from "./semantic-tokenizer.mjs";
import {
  apply_teaching_analysis,
} from "./teaching-analysis.mjs";

export const simpmusic_semantic_decoder = Object.freeze({
  name: "panio-simpmusic-semantic-decoder",
  version: "semantic-decoder-v1",
});

const han_text_pattern = /\p{Script=Han}/u;
const key_signature_pattern =
  /1\s*=\s*(?<tonic>[A-G](?:[#b♯♭])?)/iu;
const time_signature_pattern =
  /(?<beats>[2-9]|1[0-2])\s*[/／]\s*(?<beat_unit>2|4|8|16)/u;
const duration_beats = Object.freeze({
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirty_second: 0.125,
  sixty_fourth: 0.0625,
});
const degree_semitones = Object.freeze([0, 2, 4, 5, 7, 9, 11]);

export function decode_simpmusic_source_document(
  source_document,
  {
    mapping_tables = simpmusic_mapping_tables,
  } = {},
) {
  validate_source_document(source_document);

  const issue_reporter = create_issue_reporter();
  const decoded = decode_score_tokens(
    source_document,
    mapping_tables,
    issue_reporter,
  );
  const accent_associations = associate_accent_tokens(
    decoded.base_shapes,
    decoded.accent_shapes,
    issue_reporter,
  );
  const lyrics = extract_lyrics(source_document);
  const metadata = extract_metadata(
    source_document,
    decoded.tokens,
    issue_reporter,
  );
  const base_tokens = decoded.tokens.filter((token) =>
    token.role === "base");
  const base_streams = create_base_streams(decoded);
  const lyric_phrases = lyrics.map((lyric) => ({
    id: lyric.id,
    stanza_number: lyric.stanza_number,
    text: lyric.text,
    slide_number: lyric.slide_number,
    source_refs: structuredClone(lyric.annotation.source_refs),
  }));

  if (base_tokens.length === 0) {
    issue_reporter.add({
      code: "no_simpmusic",
      severity: "error",
      message: "来源文件没有可供语义解码的 SimpMusic Base 内容。",
      raw_data: {
        source_id: source_document.source_id,
        slide_count: source_document.slides.length,
      },
      source_refs: [],
    });
  }
  if (!metadata.meter) {
    issue_reporter.add({
      code: "missing_meter",
      severity: "error",
      message: "来源没有受支持且无歧义的拍号，未填入默认拍号。",
      raw_data: {
        discovered_values: metadata.discovered_meters,
      },
      source_refs: metadata.meter_source_refs,
    });
  }

  const candidate_result = base_streams.length > 0
    ? build_score_document_candidate({
        source_document,
        base_streams,
        lyric_phrases,
        metadata: {
          ...metadata,
          time_signature: metadata.meter
            ? `${metadata.meter.beats}/${metadata.meter.beat_unit}`
            : null,
        },
        add_issue: (issue) => issue_reporter.add(issue),
        importer_version: simpmusic_semantic_decoder.version,
      })
    : null;
  const provisional_issues = issue_reporter.list();
  const has_review_lyrics = candidate_result?.score_document.lyrics.some(
    (lyric) => lyric.annotation.status === "needs_review",
  ) ?? lyric_phrases.length > 0;
  const document_status =
    provisional_issues.length > 0 || has_review_lyrics
      ? "needs_review"
      : "candidate";
  const score_document = candidate_result?.score_document ?? null;
  if (score_document) {
    score_document.status = document_status;
  }
  const issues = issue_reporter.list();

  return {
    schema_version: 1,
    document_type: "simpmusic_semantic_decode",
    decoder: { ...simpmusic_semantic_decoder },
    source_id: source_document.source_id,
    score_id: source_document.score_id,
    hymn_id: source_document.hymn_id,
    mapping_version:
      source_document.provenance.font_mapping_version ??
      simpmusic_font_profile.mapping_version,
    status: score_document
      ? document_status
      : "validation_failed",
    base_streams,
    token_stream: decoded.tokens,
    tokens: decoded.tokens,
    accent_associations: add_accent_compatibility_fields(
      accent_associations,
      decoded.tokens,
    ),
    lyric_phrases,
    lyrics: score_document?.lyrics ?? lyrics,
    score_document,
    issues,
  };
}

function decode_score_tokens(
  source_document,
  mapping_tables,
  issue_reporter,
) {
  const tokens = [];
  const base_shapes = [];
  const accent_shapes = [];
  let token_number = 0;

  for (const slide of source_document.slides) {
    for (const shape of slide.shapes) {
      const shape_tokens = [];

      for (const paragraph of shape.paragraphs) {
        let run_offset = 0;
        const paragraph_length = code_points(paragraph.raw_text).length;

        for (const run of paragraph.runs) {
          const role = classification_to_role(run.classification);
          const run_length = code_points(run.raw_text).length;

          if (role) {
            const font_hash = simpmusic_font_profile.fonts[role].sha256;
            const table = mapping_tables[font_hash];
            const run_tokens = tokenize_score_run({
              run,
              role,
              table,
              shape,
              paragraph,
              paragraph_length,
              run_offset,
              slide_number: slide.index,
              next_token_id() {
                token_number += 1;
                return `semantic-token-${String(token_number).padStart(6, "0")}`;
              },
              issue_reporter,
            });
            tokens.push(...run_tokens);
            shape_tokens.push(...run_tokens);
          }
          run_offset += run_length;
        }
      }

      const descriptor = {
        slide_number: slide.index,
        shape_index: shape.index,
        shape_id: String(shape.shape_id ?? ""),
        geometry: normalize_geometry(shape.geometry),
        tokens: shape_tokens,
      };
      if (shape_tokens.some((token) => token.role === "base")) {
        base_shapes.push(descriptor);
      }
      if (shape_tokens.some((token) => token.role === "accent")) {
        accent_shapes.push(descriptor);
      }
    }
  }

  return {
    tokens,
    base_shapes,
    accent_shapes,
  };
}

function create_base_streams(decoded) {
  return decoded.base_shapes.map((shape, index) => ({
    id: `base-stream-${String(index + 1).padStart(6, "0")}`,
    slide_number: shape.slide_number,
    shape_id: shape.shape_id,
    geometry: structuredClone(shape.geometry),
    source_refs: unique_source_refs(
      shape.tokens.flatMap((token) => token.source_refs),
    ),
    tokens: shape.tokens
      .filter((token) => token.role === "base")
      .map(to_candidate_token),
  }));
}

function to_candidate_token(token) {
  const parsed = parse_candidate_token(token.semantic_token);
  return {
    id: token.id,
    ...parsed,
    semantic_token: token.semantic_token,
    raw_sequence: token.raw_sequence,
    raw_range: structuredClone(token.raw_range),
    known: token.known,
    support_status: token.support_status,
    status: token.status,
    source_refs: structuredClone(token.source_refs),
    geometry: structuredClone(token.geometry),
    accents: token.overlay_token_ids.map((token_id) => ({
      token_id,
      source_refs: [],
    })),
  };
}

function add_accent_compatibility_fields(associations, tokens) {
  const token_by_id = new Map(tokens.map((token) => [token.id, token]));
  return associations.map((association) => {
    const accent = token_by_id.get(association.accent_token_id);
    const base = token_by_id.get(association.target_token_id);
    return {
      ...association,
      base_token_id: association.target_token_id,
      accent_shape_id: accent?.shape_id ?? null,
      base_shape_id: base?.shape_id ?? null,
    };
  });
}

function tokenize_score_run({
  run,
  role,
  table,
  shape,
  paragraph,
  paragraph_length,
  run_offset,
  slide_number,
  next_token_id,
  issue_reporter,
}) {
  const context = role === "base" ? "score_base" : "score_accent";
  const entries = (table?.entries ?? [])
    .filter((entry) => entry.context === context)
    .map((entry) => ({
      ...entry,
      raw_code_points: code_points(entry.raw_sequence),
    }))
    .sort((left, right) =>
      right.raw_code_points.length - left.raw_code_points.length ||
      compare_text(left.raw_sequence, right.raw_sequence));
  const raw_code_points = code_points(run.raw_text);
  const source_refs = [to_source_reference(run.source)];
  const tokens = [];
  let offset = 0;

  while (offset < raw_code_points.length) {
    if (/^\s$/u.test(raw_code_points[offset])) {
      offset += 1;
      continue;
    }

    const entry = find_mapping_entry(entries, raw_code_points, offset);
    if (entry) {
      const end = offset + entry.raw_code_points.length;
      const token = create_semantic_token({
        id: next_token_id(),
        role,
        raw_sequence: entry.raw_sequence,
        semantic_token: entry.semantic_token,
        support_status: entry.support_status,
        known: true,
        slide_number,
        shape,
        paragraph,
        run,
        start: offset,
        end,
        paragraph_start: run_offset + offset,
        paragraph_end: run_offset + end,
        paragraph_length,
        source_refs,
      });
      tokens.push(token);
      report_unusable_token(token, issue_reporter);
      offset = end;
      continue;
    }

    const start = offset;
    offset += 1;
    while (
      offset < raw_code_points.length &&
      !/^\s$/u.test(raw_code_points[offset]) &&
      !find_mapping_entry(entries, raw_code_points, offset)
    ) {
      offset += 1;
    }
    const raw_sequence = raw_code_points.slice(start, offset).join("");
    const token = create_semantic_token({
      id: next_token_id(),
      role,
      raw_sequence,
      semantic_token: "unknown",
      support_status: "needs_review",
      known: false,
      slide_number,
      shape,
      paragraph,
      run,
      start,
      end: offset,
      paragraph_start: run_offset + start,
      paragraph_end: run_offset + offset,
      paragraph_length,
      source_refs,
    });
    tokens.push(token);
    report_unusable_token(token, issue_reporter);
  }

  return tokens;
}

function create_semantic_token({
  id,
  role,
  raw_sequence,
  semantic_token,
  support_status,
  known,
  slide_number,
  shape,
  paragraph,
  run,
  start,
  end,
  paragraph_start,
  paragraph_end,
  paragraph_length,
  source_refs,
}) {
  const semantic = parse_semantic_token(semantic_token);

  return {
    id,
    role,
    kind: semantic.kind,
    value: semantic.value,
    semantic_token,
    raw_sequence,
    raw_range: {
      unit: "code_point",
      start,
      end,
    },
    support_status,
    known,
    status: support_status === "supported"
      ? "candidate"
      : "needs_review",
    slide_number,
    shape_id: String(shape.shape_id ?? ""),
    paragraph_index: paragraph.index,
    run_index: run.index,
    geometry: estimate_token_geometry({
      shape_geometry: shape.geometry,
      paragraph_index: paragraph.index,
      paragraph_count: shape.paragraphs.length,
      paragraph_start,
      paragraph_end,
      paragraph_length,
    }),
    source_refs: structuredClone(source_refs),
    overlay_token_ids: [],
  };
}

function report_unusable_token(token, issue_reporter) {
  if (
    token.support_status === "supported" &&
    token.kind !== "unknown" &&
    token.kind !== "unresolved"
  ) {
    return;
  }

  issue_reporter.add({
    code: "unknown_token",
    severity: "error",
    message: token.known
      ? "映射条目尚未声明为可支持语义，已保留原始 token。"
      : "当前字体映射中不存在该原始序列，未尝试近似替换。",
    raw_data: token_raw_data(token),
    source_refs: token.source_refs,
  });
}

function associate_accent_tokens(
  base_shapes,
  accent_shapes,
  issue_reporter,
) {
  const associations = [];

  for (const accent_shape of accent_shapes) {
    for (const accent_token of accent_shape.tokens) {
      const candidates = base_shapes
        .filter((base_shape) =>
          base_shape.slide_number === accent_shape.slide_number)
        .map((base_shape) => ({
          base_shape,
          intersection_area: rectangle_intersection_area(
            base_shape.geometry,
            accent_shape.geometry,
          ),
          center_distance: rectangle_center_distance(
            base_shape.geometry,
            accent_shape.geometry,
          ),
        }))
        .filter((candidate) => candidate.intersection_area > 0)
        .sort((left, right) =>
          right.intersection_area - left.intersection_area ||
          left.center_distance - right.center_distance ||
          left.base_shape.shape_index - right.base_shape.shape_index);

      if (candidates.length === 0) {
        issue_reporter.add({
          code: "unassociated_accent",
          severity: "error",
          message: "Accent shape 未与同页 Base shape 发生坐标交叠。",
          raw_data: token_raw_data(accent_token),
          source_refs: accent_token.source_refs,
        });
        continue;
      }

      if (
        candidates.length > 1 &&
        candidates[0].intersection_area === candidates[1].intersection_area &&
        candidates[0].center_distance === candidates[1].center_distance
      ) {
        issue_reporter.add({
          code: "ambiguous_accent_overlap",
          severity: "error",
          message: "Accent shape 与多个 Base shape 的坐标关系相同，未猜测目标。",
          raw_data: {
            ...token_raw_data(accent_token),
            candidate_shape_ids: candidates.map((candidate) =>
              candidate.base_shape.shape_id),
          },
          source_refs: accent_token.source_refs,
        });
        continue;
      }

      const selected = candidates[0];
      const target_token = find_nearest_base_token(
        selected.base_shape.tokens,
        accent_token.geometry,
      );
      if (!target_token) {
        issue_reporter.add({
          code: "unassociated_accent",
          severity: "error",
          message: "Accent shape 命中的 Base shape 没有可关联 token。",
          raw_data: token_raw_data(accent_token),
          source_refs: accent_token.source_refs,
        });
        continue;
      }

      target_token.overlay_token_ids.push(accent_token.id);
      associations.push({
        id: `accent-association-${String(associations.length + 1).padStart(6, "0")}`,
        accent_token_id: accent_token.id,
        target_token_id: target_token.id,
        status:
          accent_token.support_status === "supported" &&
          target_token.support_status === "supported"
            ? "candidate"
            : "needs_review",
        geometry_relation: {
          intersection_area: selected.intersection_area,
          center_distance: selected.center_distance,
          target_shape_id: selected.base_shape.shape_id,
        },
        source_refs: unique_source_refs([
          ...target_token.source_refs,
          ...accent_token.source_refs,
        ]),
      });
    }
  }

  return associations;
}

function extract_lyrics(source_document) {
  const lyrics = [];

  for (const slide of source_document.slides) {
    for (const shape of slide.shapes) {
      const runs = shape.paragraphs.flatMap((paragraph) => paragraph.runs);
      const contains_score = runs.some((run) =>
        classification_to_role(run.classification));
      const has_classified_lyrics = runs.some((run) =>
        run.classification === "lyrics");
      const fallback_han_text =
        !contains_score &&
        han_text_pattern.test(shape.raw_text) &&
        !is_strict_metadata_text(shape.raw_text);

      if (contains_score || (!has_classified_lyrics && !fallback_han_text)) {
        continue;
      }

      const lines = extract_shape_text_lines(shape);
      for (const line of lines) {
        lyrics.push({
          id: `lyric-${String(lyrics.length + 1).padStart(6, "0")}`,
          stanza_number: slide.index,
          text: line.text,
          language: han_text_pattern.test(line.text) ? "zh-CN" : null,
          event_ids: [],
          range: null,
          slide_number: slide.index,
          annotation: {
            source: "pptx",
            status: "needs_review",
            reason:
              "PPTX 仅支持行级或乐句级歌词回退；未可靠建立逐音对应。",
            confirmed_by: null,
            confirmed_at: null,
            source_refs: line.source_refs,
          },
        });
      }
    }
  }

  return lyrics;
}

function extract_shape_text_lines(shape) {
  const lines = [];

  for (const paragraph of shape.paragraphs) {
    let text = "";
    let source_refs = [];

    const flush = () => {
      const normalized_text = text.trim();
      if (normalized_text) {
        lines.push({
          text: normalized_text,
          source_refs: unique_source_refs(source_refs),
        });
      }
      text = "";
      source_refs = [];
    };

    for (const run of paragraph.runs) {
      const parts = String(run.raw_text).split("\n");
      for (let index = 0; index < parts.length; index += 1) {
        if (parts[index]) {
          text += parts[index];
          source_refs.push(to_source_reference(run.source));
        }
        if (index < parts.length - 1) {
          flush();
        }
      }
    }
    flush();
  }

  return lines;
}

function extract_metadata(source_document, tokens, issue_reporter) {
  const discovered_keys = [];
  const discovered_meters = [];
  const key_source_refs = [];
  const meter_source_refs = [];

  for (const slide of source_document.slides) {
    for (const shape of slide.shapes) {
      const key_match = String(shape.raw_text).match(key_signature_pattern);
      const meter_match = String(shape.raw_text).match(time_signature_pattern);
      const shape_refs = unique_source_refs(
        shape.paragraphs.flatMap((paragraph) =>
          paragraph.runs
            .filter((run) => run.run_type !== "line_break")
            .map((run) => to_source_reference(run.source))),
      );

      if (key_match?.groups?.tonic) {
        discovered_keys.push(
          `1=${normalize_tonic_name(key_match.groups.tonic)}`,
        );
        key_source_refs.push(...shape_refs);
      }
      if (meter_match?.groups) {
        discovered_meters.push({
          beats: Number(meter_match.groups.beats),
          beat_unit: Number(meter_match.groups.beat_unit),
        });
        meter_source_refs.push(...shape_refs);
      }
    }
  }

  for (const token of tokens) {
    if (token.support_status !== "supported") {
      continue;
    }
    if (token.kind === "meter") {
      discovered_meters.push(token.value);
      meter_source_refs.push(...token.source_refs);
    } else if (token.kind === "key_signature") {
      discovered_keys.push(token.value);
      key_source_refs.push(...token.source_refs);
    }
  }

  const meters = unique_structured_values(discovered_meters);
  const keys = [...new Set(discovered_keys)];
  const tonic_midis = unique_structured_values(
    tokens
      .filter((token) =>
        token.support_status === "supported" &&
        token.kind === "tonic_midi")
      .map((token) => token.value),
  );

  report_metadata_conflict(
    "meter",
    meters,
    meter_source_refs,
    issue_reporter,
  );
  report_metadata_conflict(
    "key_signature",
    keys,
    key_source_refs,
    issue_reporter,
  );
  report_metadata_conflict(
    "tonic_midi",
    tonic_midis,
    tokens
      .filter((token) => token.kind === "tonic_midi")
      .flatMap((token) => token.source_refs),
    issue_reporter,
  );

  return {
    meter: meters.length === 1 ? meters[0] : null,
    key_signature: keys.length === 1 ? keys[0] : null,
    tonic_midi: tonic_midis.length === 1 ? tonic_midis[0] : null,
    discovered_meters: meters,
    discovered_keys: keys,
    meter_source_refs: unique_source_refs(meter_source_refs),
    key_source_refs: unique_source_refs(key_source_refs),
  };
}

function build_score_candidate_data(
  base_shapes,
  all_tokens,
  metadata,
  issue_reporter,
) {
  const tokens_by_id = new Map(all_tokens.map((token) => [token.id, token]));
  const ordered_shapes = [...base_shapes].sort((left, right) =>
    left.slide_number - right.slide_number ||
    left.geometry.y - right.geometry.y ||
    left.geometry.x - right.geometry.x ||
    left.shape_index - right.shape_index);
  const measures = [];
  let current_events = [];
  let cursor = 0;
  let pending = null;
  let next_duration = null;
  let next_accidental = 0;
  let next_octave = 0;
  let next_hold = false;
  let next_onset = null;
  let current_hand = null;
  let current_voice = 1;
  let event_number = 0;
  let note_number = 0;
  let unresolved_required_field = false;

  const close_measure = () => {
    if (current_events.length === 0) {
      cursor = 0;
      return;
    }
    if (
      metadata.meter &&
      Math.abs(cursor - metadata.meter.beats) > 0.0001
    ) {
      issue_reporter.add({
        code: "incomplete_duration",
        severity: "error",
        message: "小节内事件时值之和与拍号不闭合。",
        raw_data: {
          measure_number: measures.length + 1,
          expected_beats: metadata.meter.beats,
          actual_beats: cursor,
        },
        source_refs: unique_source_refs(
          current_events.flatMap((event) => event.source_refs),
        ),
      });
    }
    measures.push({
      events: current_events,
    });
    current_events = [];
    cursor = 0;
    next_onset = null;
  };

  const flush_pending = () => {
    if (!pending) {
      return;
    }

    const item = pending;
    pending = null;
    if (!(item.duration > 0)) {
      unresolved_required_field = true;
      issue_reporter.add({
        code: "incomplete_duration",
        severity: "error",
        message: "音符或休止缺少受支持的时值 token，未填入默认时值。",
        raw_data: {
          item_type: item.type,
          degree: item.degree ?? null,
          raw_tokens: item.tokens.map(token_raw_data),
        },
        source_refs: item.source_refs,
      });
      return;
    }
    if (!current_hand) {
      unresolved_required_field = true;
      issue_reporter.add({
        code: "event_hand_ambiguity",
        severity: "error",
        message: "事件缺少受支持的手别 token，未默认指定左右手。",
        raw_data: {
          item_type: item.type,
          raw_tokens: item.tokens.map(token_raw_data),
        },
        source_refs: item.source_refs,
      });
      return;
    }

    let notes = [];
    if (item.type === "note") {
      if (metadata.tonic_midi === null) {
        unresolved_required_field = true;
        issue_reporter.add({
          code: "pitch_ambiguity",
          severity: "error",
          message: "音级 token 缺少明确的绝对主音 MIDI，未猜测音高。",
          raw_data: {
            degree: item.degree,
            accidental: item.accidental,
            octave: item.octave,
            key_signature: metadata.key_signature,
            raw_tokens: item.tokens.map(token_raw_data),
          },
          source_refs: item.source_refs,
        });
        return;
      }

      const midi =
        metadata.tonic_midi +
        degree_semitones[item.degree - 1] +
        item.accidental +
        item.octave * 12;
      if (!Number.isInteger(midi) || midi < 21 || midi > 108) {
        unresolved_required_field = true;
        issue_reporter.add({
          code: "pitch_ambiguity",
          severity: "error",
          message: "解码音高超出 ScoreDocument 支持范围，未截断或移调。",
          raw_data: {
            degree: item.degree,
            accidental: item.accidental,
            octave: item.octave,
            resolved_midi: midi,
          },
          source_refs: item.source_refs,
        });
        return;
      }
      note_number += 1;
      notes = [{
        id: `note-${note_number}`,
        midi,
        source_refs: item.source_refs,
      }];
    }

    const onset = item.onset ?? cursor;
    if (
      metadata.meter &&
      onset + item.duration > metadata.meter.beats + 0.0001
    ) {
      unresolved_required_field = true;
      issue_reporter.add({
        code: "incomplete_duration",
        severity: "error",
        message: "事件结束拍点超出当前小节，未裁剪时值。",
        raw_data: {
          onset_beats: onset,
          duration_beats: item.duration,
          meter: metadata.meter,
        },
        source_refs: item.source_refs,
      });
      return;
    }

    const overlaps = current_events.filter((event) =>
      event.hand === current_hand &&
      event.voice === current_voice &&
      ranges_overlap(
        onset,
        onset + item.duration,
        event.onset_beats,
        event.onset_beats + event.duration_beats,
      ));
    if (overlaps.length > 0) {
      issue_reporter.add({
        code: "event_overlap",
        severity: "error",
        message: "同一小节、手别和声部存在时间重叠事件。",
        raw_data: {
          onset_beats: onset,
          duration_beats: item.duration,
          overlapping_event_ids: overlaps.map((event) => event.id),
        },
        source_refs: unique_source_refs([
          ...item.source_refs,
          ...overlaps.flatMap((event) => event.source_refs),
        ]),
      });
    }

    event_number += 1;
    const event = {
      id: `event-${event_number}`,
      onset_beats: onset,
      duration_beats: item.duration,
      hand: current_hand,
      voice: current_voice,
      notes,
      ...(item.hold ? { sustain: true } : {}),
      ...(item.tie ? { tie: item.tie } : {}),
      source_refs: item.source_refs,
    };
    current_events.push(event);
    cursor = Math.max(cursor, onset + item.duration);
  };

  const start_item = (type, token, values = {}) => {
    flush_pending();
    pending = {
      type,
      degree: values.degree,
      accidental: next_accidental,
      octave: next_octave,
      duration: values.duration ?? next_duration,
      hold: next_hold,
      tie: null,
      onset: next_onset,
      tokens: [token],
      source_refs: [...token.source_refs],
    };
    next_duration = null;
    next_accidental = 0;
    next_octave = 0;
    next_hold = false;
    next_onset = null;
  };

  for (const shape of ordered_shapes) {
    for (const base_token of shape.tokens) {
      const semantic_tokens = [
        base_token,
        ...base_token.overlay_token_ids
          .map((token_id) => tokens_by_id.get(token_id))
          .filter(Boolean),
      ];

      for (const token of semantic_tokens) {
        if (token.support_status !== "supported") {
          continue;
        }
        if (token.kind === "meter" || token.kind === "tonic_midi") {
          continue;
        }
        if (token.kind === "hand") {
          current_hand = token.value;
        } else if (token.kind === "voice") {
          current_voice = token.value;
        } else if (token.kind === "degree") {
          start_item("note", token, { degree: token.value });
        } else if (token.kind === "rest") {
          start_item("rest", token, {
            duration: token.value.duration_beats,
          });
        } else if (token.kind === "duration") {
          if (pending) {
            pending.duration = token.value;
            append_pending_token(pending, token);
          } else {
            next_duration = token.value;
          }
        } else if (token.kind === "accidental") {
          const accidental = accidental_offset(token.value);
          if (pending?.type === "note") {
            pending.accidental = accidental;
            append_pending_token(pending, token);
          } else {
            next_accidental = accidental;
          }
        } else if (token.kind === "octave") {
          if (pending?.type === "note") {
            pending.octave += token.value;
            append_pending_token(pending, token);
          } else {
            next_octave += token.value;
          }
        } else if (token.kind === "hold") {
          if (pending) {
            pending.hold = true;
            append_pending_token(pending, token);
          } else {
            next_hold = true;
          }
        } else if (token.kind === "tie") {
          if (pending) {
            pending.tie = token.value;
            append_pending_token(pending, token);
          }
        } else if (token.kind === "onset") {
          next_onset = token.value;
        } else if (token.kind === "barline") {
          flush_pending();
          close_measure();
        }
      }
    }
    flush_pending();
  }
  close_measure();

  return {
    measures,
    unresolved_required_field,
  };
}

function create_score_document_candidate({
  source_document,
  metadata,
  lyrics,
  score_build,
  status,
}) {
  if (
    !metadata.meter ||
    !metadata.key_signature ||
    metadata.tonic_midi === null ||
    score_build.unresolved_required_field ||
    score_build.measures.length === 0 ||
    score_build.measures.every((measure) => measure.events.length === 0)
  ) {
    return null;
  }

  const measures = score_build.measures.map((measure, index) => ({
    id: `measure-${index + 1}`,
    number: String(index + 1),
    meter: { ...metadata.meter },
    events: measure.events,
  }));
  const provenance_references = unique_source_refs([
    ...metadata.key_source_refs,
    ...metadata.meter_source_refs,
    ...measures.flatMap((measure) =>
      measure.events.flatMap((event) => event.source_refs)),
    ...lyrics.flatMap((lyric) => lyric.annotation.source_refs),
  ]);

  return apply_teaching_analysis({
    schema_version: 2,
    id: source_document.score_id,
    number: source_document.hymn_id ?? null,
    title: source_document.title,
    key_signature: metadata.key_signature,
    tonic_midi: metadata.tonic_midi,
    time_signature:
      `${metadata.meter.beats}/${metadata.meter.beat_unit}`,
    status,
    provenance: {
      kind: "pptx",
      source_id: source_document.source_id,
      source_file: source_document.provenance.source_file,
      source_sha256: source_document.provenance.source_sha256,
      font_config_version:
        source_document.provenance.font_config_version,
      importer_version: source_document.provenance.importer.version,
      references: provenance_references,
    },
    lyrics,
    hand_positions: [],
    measures,
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: null,
      published_at: null,
      note: null,
    },
  });
}

function parse_semantic_token(semantic_token) {
  let match = semantic_token.match(/^degree\.([1-7])$/u);
  if (match) {
    return { kind: "degree", value: Number(match[1]) };
  }

  match = semantic_token.match(
    /^accidental\.(sharp|flat|natural|double_sharp|double_flat)$/u,
  );
  if (match) {
    return { kind: "accidental", value: match[1] };
  }

  match = semantic_token.match(/^octave\.(up|down)(?:\.(\d+))?$/u);
  if (match) {
    const amount = Number(match[2] ?? 1);
    return {
      kind: "octave",
      value: match[1] === "up" ? amount : -amount,
    };
  }

  match = semantic_token.match(/^duration\.([a-z_]+)$/u);
  if (match && duration_beats[match[1]]) {
    return { kind: "duration", value: duration_beats[match[1]] };
  }
  match = semantic_token.match(/^duration\.beats\.(\d+(?:\.\d+)?)$/u);
  if (match && Number(match[1]) > 0) {
    return { kind: "duration", value: Number(match[1]) };
  }

  match = semantic_token.match(/^rest\.([a-z_]+)$/u);
  if (match && duration_beats[match[1]]) {
    return {
      kind: "rest",
      value: { duration_beats: duration_beats[match[1]] },
    };
  }

  match = semantic_token.match(
    /^barline\.(single|double|final|repeat_start|repeat_end)$/u,
  );
  if (match) {
    return { kind: "barline", value: match[1] };
  }

  if (semantic_token === "hold") {
    return { kind: "hold", value: true };
  }

  match = semantic_token.match(/^tie\.(start|continue|stop)$/u);
  if (match) {
    return { kind: "tie", value: match[1] };
  }

  match = semantic_token.match(/^meter\.(\d+)\/(\d+)$/u);
  if (match && Number(match[1]) > 0 && Number(match[2]) > 0) {
    return {
      kind: "meter",
      value: {
        beats: Number(match[1]),
        beat_unit: Number(match[2]),
      },
    };
  }

  match = semantic_token.match(/^tonic_midi\.(\d+)$/u);
  if (match && Number(match[1]) >= 0 && Number(match[1]) <= 127) {
    return { kind: "tonic_midi", value: Number(match[1]) };
  }

  match = semantic_token.match(/^key_signature\.(.+)$/u);
  if (match) {
    return {
      kind: "key_signature",
      value: match[1].replaceAll("_", " "),
    };
  }

  match = semantic_token.match(/^hand\.(left|right)$/u);
  if (match) {
    return { kind: "hand", value: match[1] };
  }

  match = semantic_token.match(/^voice\.(\d+)$/u);
  if (match && Number(match[1]) <= 128) {
    return { kind: "voice", value: Number(match[1]) };
  }

  match = semantic_token.match(/^onset\.beats\.(\d+(?:\.\d+)?)$/u);
  if (match) {
    return { kind: "onset", value: Number(match[1]) };
  }

  if (
    semantic_token === "unknown" ||
    semantic_token.startsWith("unknown.")
  ) {
    return { kind: "unknown", value: null };
  }
  if (semantic_token.startsWith("unresolved.")) {
    return { kind: "unresolved", value: semantic_token };
  }
  return { kind: "other", value: semantic_token };
}

function append_pending_token(pending, token) {
  pending.tokens.push(token);
  pending.source_refs = unique_source_refs([
    ...pending.source_refs,
    ...token.source_refs,
  ]);
}

function find_mapping_entry(entries, raw_code_points, offset) {
  return entries.find((entry) =>
    entry.raw_code_points.every((code_point, index) =>
      raw_code_points[offset + index] === code_point));
}

function find_nearest_base_token(tokens, accent_geometry) {
  const candidates = tokens
    .filter((token) => token.role === "base")
    .map((token) => ({
      token,
      overlap: horizontal_intersection(
        token.geometry,
        accent_geometry,
      ),
      distance: Math.abs(
        rectangle_center_x(token.geometry) -
        rectangle_center_x(accent_geometry),
      ),
    }))
    .sort((left, right) =>
      right.overlap - left.overlap ||
      left.distance - right.distance ||
      compare_text(left.token.id, right.token.id));
  return candidates[0]?.token ?? null;
}

function estimate_token_geometry({
  shape_geometry,
  paragraph_index,
  paragraph_count,
  paragraph_start,
  paragraph_end,
  paragraph_length,
}) {
  const geometry = normalize_geometry(shape_geometry);
  const safe_length = Math.max(paragraph_length, 1);
  const row_height = geometry.cy / Math.max(paragraph_count, 1);

  return {
    x: geometry.x + geometry.cx * (paragraph_start / safe_length),
    y: geometry.y + row_height * (paragraph_index - 1),
    cx: geometry.cx *
      (Math.max(paragraph_end - paragraph_start, 1) / safe_length),
    cy: row_height,
  };
}

function normalize_geometry(geometry) {
  return {
    x: finite_number(geometry?.x),
    y: finite_number(geometry?.y),
    cx: Math.max(finite_number(geometry?.cx), 0),
    cy: Math.max(finite_number(geometry?.cy), 0),
  };
}

function rectangle_intersection_area(left, right) {
  return horizontal_intersection(left, right) *
    Math.max(
      0,
      Math.min(left.y + left.cy, right.y + right.cy) -
      Math.max(left.y, right.y),
    );
}

function horizontal_intersection(left, right) {
  return Math.max(
    0,
    Math.min(left.x + left.cx, right.x + right.cx) -
    Math.max(left.x, right.x),
  );
}

function rectangle_center_distance(left, right) {
  const x_distance = rectangle_center_x(left) - rectangle_center_x(right);
  const y_distance =
    left.y + left.cy / 2 - (right.y + right.cy / 2);
  return Math.hypot(x_distance, y_distance);
}

function rectangle_center_x(geometry) {
  return geometry.x + geometry.cx / 2;
}

function ranges_overlap(left_start, left_end, right_start, right_end) {
  return left_start < right_end - 0.0001 &&
    right_start < left_end - 0.0001;
}

function classification_to_role(classification) {
  if (classification === "score_base") {
    return "base";
  }
  if (classification === "score_accent") {
    return "accent";
  }
  return null;
}

function accidental_offset(accidental) {
  return {
    double_flat: -2,
    flat: -1,
    natural: 0,
    sharp: 1,
    double_sharp: 2,
  }[accidental];
}

function token_raw_data(token) {
  return {
    raw_sequence: token.raw_sequence,
    raw_range: structuredClone(token.raw_range),
    semantic_token: token.semantic_token,
    support_status: token.support_status,
    known: token.known,
    role: token.role,
    geometry: structuredClone(token.geometry),
  };
}

function create_issue_reporter() {
  const issues = [];

  return {
    add({
      code,
      severity,
      message,
      raw_data,
      source_refs,
    }) {
      const issue = {
        id: `semantic-issue-${String(issues.length + 1).padStart(6, "0")}`,
        code,
        severity,
        status: "needs_review",
        message,
        raw_data: structuredClone(raw_data ?? null),
        source_refs: unique_source_refs(source_refs ?? []),
      };
      issues.push(issue);
      return issue;
    },
    list() {
      return structuredClone(issues);
    },
  };
}

function report_metadata_conflict(
  field,
  values,
  source_refs,
  issue_reporter,
) {
  if (values.length <= 1) {
    return;
  }
  issue_reporter.add({
    code: field === "tonic_midi"
      ? "pitch_ambiguity"
      : "metadata_conflict",
    severity: "error",
    message: `来源包含多个不同的 ${field} 值，未选择其中之一。`,
    raw_data: {
      field,
      values,
    },
    source_refs: unique_source_refs(source_refs),
  });
}

function unique_structured_values(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    const key = JSON.stringify(value);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }
  return unique;
}

function unique_source_refs(source_refs) {
  const seen = new Set();
  const unique = [];

  for (const reference of source_refs) {
    if (!reference) {
      continue;
    }
    const normalized = {
      slide_number: reference.slide_number,
      shape_id: String(reference.shape_id),
      paragraph_index: reference.paragraph_index ?? null,
      run_index: reference.run_index ?? null,
    };
    const key = JSON.stringify(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(normalized);
    }
  }
  return unique;
}

function to_source_reference(source) {
  return {
    slide_number: source.slide_index,
    shape_id: String(source.shape_id ?? ""),
    paragraph_index: source.paragraph_index ?? null,
    run_index: source.run_index ?? null,
  };
}

function is_strict_metadata_text(raw_text) {
  const trimmed = String(raw_text).trim();
  return key_signature_pattern.test(trimmed) ||
    time_signature_pattern.test(trimmed);
}

function normalize_tonic_name(tonic) {
  return tonic
    .toUpperCase()
    .replace("♯", "#")
    .replace("♭", "b");
}

function finite_number(value) {
  return Number.isFinite(value) ? value : 0;
}

function code_points(value) {
  return Array.from(String(value ?? ""));
}

function compare_text(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function validate_source_document(source_document) {
  if (
    source_document?.document_type !== "pptx_source_document" ||
    source_document.schema_version !== 1 ||
    !Array.isArray(source_document.slides) ||
    !source_document.provenance
  ) {
    throw new Error("无效的 PptxSourceDocument");
  }
}
