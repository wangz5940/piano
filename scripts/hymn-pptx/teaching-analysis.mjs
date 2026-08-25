const major_scale_intervals = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const natural_minor_scale_intervals = Object.freeze([0, 2, 3, 5, 7, 8, 10]);
const sharp_note_names = Object.freeze([
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
]);
const flat_note_names = Object.freeze([
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]);

export function apply_teaching_analysis(score_document) {
  if (score_document?.schema_version !== 2) {
    throw new TypeError("Teaching analysis requires ScoreDocument v2.");
  }

  const analyzed = structuredClone(score_document);
  if (!Array.isArray(analyzed.hand_positions)) {
    analyzed.hand_positions = [];
  }
  if (analyzed.hand_positions.length === 0) {
    analyzed.hand_positions = generate_hand_positions(analyzed);
  }
  apply_harmony_suggestions(analyzed);
  apply_contextual_fingerings(analyzed);
  return analyzed;
}

function generate_hand_positions(document) {
  const scale_intervals = get_scale_intervals(document.key_signature);
  const scale_notes = build_scale_notes(document.tonic_midi, scale_intervals);
  const position_candidates = scale_notes.slice(0, -4).map((root, index) => ({
    root,
    covered_midis: scale_notes.slice(index, index + 5),
  }));
  const tonic_position = position_candidates.find((position) =>
    position.root === document.tonic_midi) ?? position_candidates[0];
  const measure_choices = [];
  document.measures.forEach((measure, measure_index) => {
    const melody_midis = get_measure_melody_midis(measure);
    const previous = measure_index > 0
      ? document.measures[measure_index - 1]
      : null;
    const next = document.measures[measure_index + 1] ?? null;
    const previous_midis = previous ? get_measure_melody_midis(previous) : [];
    const next_midis = next ? get_measure_melody_midis(next) : [];
    const previous_choice = measure_index > 0
      ? measure_choices[measure_index - 1]
      : null;
    const selected = select_position({
      candidates: position_candidates,
      notes: melody_midis,
      tonic_position,
      previous_position: previous_choice,
    });
    measure_choices.push({
      ...selected,
      measure,
      melody_midis,
      previous_midis,
      next_midis,
    });
  });
  const home_root = measure_choices.find((choice) =>
    choice.melody_midis.length > 0)?.root ?? tonic_position.root;
  let previous_root = null;
  let away_from_home = false;

  return measure_choices.flatMap((choice, index) => {
    if (choice.melody_midis.length === 0) {
      return [];
    }
    let movement = "stay";
    if (previous_root !== null && choice.root !== previous_root) {
      movement = choice.root === home_root && away_from_home
        ? "return"
        : "move";
    }
    away_from_home = choice.root !== home_root;
    previous_root = choice.root;
    const reason = describe_position_reason(document, choice, movement);
    return [{
      id: `${document.id}-position-${String(index + 1).padStart(4, "0")}`,
      hand: "right",
      range: {
        start: { measure_id: choice.measure.id, beat: 0 },
        end: {
          measure_id: choice.measure.id,
          beat: choice.measure.meter.beats,
        },
      },
      position_name: `${midi_to_name(choice.root)} Position`,
      covered_midis: [...choice.covered_midis],
      finger_map: choice.covered_midis.map((midi, finger_index) => ({
        finger: finger_index + 1,
        midi,
      })),
      movement,
      annotation: generated_annotation(reason),
    }];
  });
}

function select_position({
  candidates,
  notes,
  tonic_position,
  previous_position,
}) {
  if (notes.length === 0) {
    return previous_position ?? tonic_position;
  }
  if (covers_all_notes(tonic_position, notes)) {
    return tonic_position;
  }

  const covering = candidates.filter((candidate) =>
    covers_all_notes(candidate, notes));
  if (covering.length > 0) {
    return [...covering].sort((left, right) =>
      distance_from(left.root, previous_position?.root ?? tonic_position.root) -
        distance_from(right.root, previous_position?.root ?? tonic_position.root) ||
      distance_from(left.root, tonic_position.root) -
        distance_from(right.root, tonic_position.root) ||
      left.root - right.root)[0];
  }

  const minimum = Math.min(...notes);
  const maximum = Math.max(...notes);
  return [...candidates].sort((left, right) =>
    count_uncovered_notes(left, notes) - count_uncovered_notes(right, notes) ||
    range_distance(left.covered_midis, minimum, maximum) -
      range_distance(right.covered_midis, minimum, maximum) ||
    distance_from(left.root, previous_position?.root ?? tonic_position.root) -
      distance_from(right.root, previous_position?.root ?? tonic_position.root) ||
    left.root - right.root)[0];
}

function describe_position_reason(document, choice, movement) {
  const range = `${midi_to_name(Math.min(...choice.melody_midis))}–${
    midi_to_name(Math.max(...choice.melody_midis))
  }`;
  const lyric = find_measure_lyric(document, choice.measure.id);
  const phrase = lyric ? `“${lyric.text}”乐句` : `第 ${choice.measure.number} 小节`;
  const context = [
    choice.previous_midis.length > 0
      ? `前一小节最高音 ${midi_to_name(Math.max(...choice.previous_midis))}`
      : "前文为乐句起点",
    choice.next_midis.length > 0
      ? `后一小节最低音 ${midi_to_name(Math.min(...choice.next_midis))}`
      : "后文为乐句收束",
  ].join("，");
  const movement_reason = movement === "move"
    ? "当前音域超出上一五指位置，因此在本小节移动"
    : movement === "return"
      ? "旋律回到起始五指覆盖范围，因此在本小节回位"
      : "当前五指位置可完整覆盖，无需移动";
  return `${document.key_signature} 中，${phrase}音域为 ${range}；${context}。${movement_reason}。`;
}

function apply_harmony_suggestions(document) {
  let previous_generated_chord = null;

  for (const measure of document.measures) {
    const source_chord_event = measure.events.find((event) =>
      event.chord && event.teaching_role !== "left_hand_suggestion");
    if (source_chord_event?.chord && !source_chord_event.chord_annotation) {
      source_chord_event.chord_annotation = annotation_for_existing_value(
        document,
        `来源谱面已有 ${source_chord_event.chord} 和弦标记。`,
        source_chord_event.source_refs ?? [],
      );
    }
    const melody_midis = get_measure_melody_midis(measure);
    if (melody_midis.length === 0) {
      continue;
    }
    const chord = source_chord_event?.chord ?? infer_chord(
      document,
      melody_midis,
      previous_generated_chord,
    );
    if (!source_chord_event) {
      previous_generated_chord = chord;
    }

    const existing_suggestion = measure.events.find((event) =>
      event.teaching_role === "left_hand_suggestion");
    if (existing_suggestion) {
      continue;
    }
    const existing_left = measure.events.find((event) => event.hand === "left");
    if (existing_left) {
      if (!existing_left.chord) {
        existing_left.chord = chord;
        existing_left.chord_annotation = generated_annotation(
          describe_chord_reason(
            document,
            chord,
            melody_midis,
            source_chord_event,
          ),
        );
      }
      continue;
    }

    const chord_reason = describe_chord_reason(
      document,
      chord,
      melody_midis,
      source_chord_event,
    );
    const chord_midis = get_left_hand_chord_midis(
      chord,
      document.tonic_midi,
    );
    measure.events.push({
      id: `${measure.id}-left-suggestion`,
      onset_beats: 0,
      duration_beats: measure.meter.beats,
      hand: "left",
      voice: 2,
      notes: chord_midis.map((midi, note_index) => ({
        id: `${measure.id}-left-suggestion-note-${note_index + 1}`,
        midi,
        source_refs: [],
      })),
      chord,
      chord_annotation: generated_annotation(chord_reason),
      teaching_role: "left_hand_suggestion",
      source_refs: [],
    });
  }
}

function infer_chord(document, melody_midis, previous_chord) {
  const is_minor = is_minor_key(document.key_signature);
  const candidates = is_minor
    ? [
        chord_candidate(document.tonic_midi, 0, "m"),
        chord_candidate(document.tonic_midi, 5, "m"),
        chord_candidate(document.tonic_midi, 7, ""),
        chord_candidate(document.tonic_midi, 8, ""),
      ]
    : [
        chord_candidate(document.tonic_midi, 0, ""),
        chord_candidate(document.tonic_midi, 5, ""),
        chord_candidate(document.tonic_midi, 7, ""),
        chord_candidate(document.tonic_midi, 9, "m"),
      ];
  const pitch_classes = melody_midis.map(positive_pitch_class);
  const final_pitch_class = pitch_classes.at(-1);

  return [...candidates].sort((left, right) =>
    score_chord(right, pitch_classes, final_pitch_class, previous_chord) -
      score_chord(left, pitch_classes, final_pitch_class, previous_chord) ||
    left.order - right.order)[0].symbol;
}

function chord_candidate(tonic_midi, offset, quality) {
  const root_pitch_class = positive_pitch_class(tonic_midi + offset);
  const intervals = quality === "m" ? [0, 3, 7] : [0, 4, 7];
  return {
    symbol: `${sharp_note_names[root_pitch_class]}${quality}`,
    pitch_classes: intervals.map((interval) =>
      positive_pitch_class(root_pitch_class + interval)),
    root_pitch_class,
    order: offset,
  };
}

function score_chord(chord, pitch_classes, final_pitch_class, previous_chord) {
  const matched = pitch_classes.filter((pitch_class) =>
    chord.pitch_classes.includes(pitch_class)).length;
  const final_bonus = chord.pitch_classes.includes(final_pitch_class) ? 3 : 0;
  const root_bonus = final_pitch_class === chord.root_pitch_class ? 2 : 0;
  const continuity_bonus = previous_chord === chord.symbol ? 0.25 : 0;
  return matched * 2 + final_bonus + root_bonus + continuity_bonus;
}

function describe_chord_reason(
  document,
  chord,
  melody_midis,
  source_chord_event,
) {
  if (source_chord_event?.chord_annotation?.source === "manual") {
    return `依据人工标记的 ${chord} 和弦，生成左手和弦形状建议；人工和弦事实保持不变。`;
  }
  if (source_chord_event?.chord_annotation?.source === "pptx") {
    return `依据 PPTX 原谱标记的 ${chord} 和弦，生成左手和弦形状建议；原谱与系统建议分开记录。`;
  }
  const melody = [...new Set(melody_midis.map(midi_to_name))].join("、");
  return `依据 ${document.key_signature} 调性、本小节旋律 ${melody} 与相邻和声上下文，候选 ${chord} 并建议左手先整体准备和弦形状。`;
}

function apply_contextual_fingerings(document) {
  const note_contexts = build_note_contexts(document);
  const note_context_by_id = new Map(
    note_contexts.map((context, index) => [context.note.id, {
      ...context,
      previous: find_adjacent_context(note_contexts, index, -1),
      next: find_adjacent_context(note_contexts, index, 1),
    }]),
  );
  const positions_by_measure = new Map();
  for (const position of document.hand_positions) {
    if (!positions_by_measure.has(position.range.start.measure_id)) {
      positions_by_measure.set(position.range.start.measure_id, position);
    }
  }

  for (const measure of document.measures) {
    const position = positions_by_measure.get(measure.id);
    for (const event of measure.events) {
      const sorted_notes = [...event.notes].sort((left, right) =>
        left.midi - right.midi);
      const chord_fingers = get_chord_fingers(sorted_notes.length, event.hand);
      for (const note of event.notes) {
        if (note.finger !== undefined) {
          if (!note.fingering) {
            note.fingering = annotation_for_existing_value(
              document,
              "来源谱面已有逐音指法，教学分析只补充来源说明。",
              note.source_refs ?? [],
            );
          }
          continue;
        }

        const context = note_context_by_id.get(note.id);
        const chord_index = sorted_notes.findIndex((candidate) =>
          candidate.id === note.id);
        const position_finger = position?.finger_map.find((entry) =>
          entry.midi === note.midi)?.finger;
        const finger = sorted_notes.length > 1
          ? chord_fingers[chord_index] ?? chord_fingers.at(-1)
          : position_finger ?? choose_context_finger(context);
        note.finger = finger;
        note.fingering = generated_annotation(
          describe_fingering_reason(
            note,
            event,
            position,
            context,
            finger,
          ),
          note.source_refs ?? [],
        );
      }
    }
  }
}

function build_note_contexts(document) {
  return document.measures.flatMap((measure, measure_index) =>
    [...measure.events]
      .sort((left, right) =>
        left.onset_beats - right.onset_beats ||
        left.voice - right.voice ||
        left.id.localeCompare(right.id))
      .flatMap((event) =>
        event.notes.map((note) => ({
          note,
          event,
          measure,
          measure_index,
          hand: event.hand,
        }))));
}

function find_adjacent_context(contexts, index, direction) {
  const hand = contexts[index].hand;
  for (
    let candidate_index = index + direction;
    candidate_index >= 0 && candidate_index < contexts.length;
    candidate_index += direction
  ) {
    if (contexts[candidate_index].hand === hand) {
      return contexts[candidate_index];
    }
  }
  return null;
}

function choose_context_finger(context) {
  if (!context) {
    return 3;
  }
  const previous_midi = context.previous?.note.midi;
  const next_midi = context.next?.note.midi;
  if (context.hand === "left") {
    if (next_midi !== undefined && next_midi < context.note.midi) {
      return 1;
    }
    return 5;
  }
  if (previous_midi !== undefined && next_midi !== undefined) {
    if (previous_midi < context.note.midi && next_midi > context.note.midi) {
      return 3;
    }
    if (previous_midi > context.note.midi && next_midi < context.note.midi) {
      return 3;
    }
  }
  if (next_midi !== undefined) {
    return next_midi > context.note.midi ? 1 : 5;
  }
  if (previous_midi !== undefined) {
    return previous_midi < context.note.midi ? 5 : 1;
  }
  return 3;
}

function describe_fingering_reason(note, event, position, context, finger) {
  const previous = context?.previous
    ? `前音 ${midi_to_name(context.previous.note.midi)}`
    : "前音为乐句起点";
  const next = context?.next
    ? `后音 ${midi_to_name(context.next.note.midi)}`
    : "后音为乐句收束";
  const position_reason = position
    ? `${position.position_name} 的覆盖音与 ${position.movement} 状态`
    : "当前乐句音域";
  const event_reason = event.notes.length > 1
    ? "同时考虑和弦音的整体手型"
    : "同时预留相邻音的行进方向";
  return `${midi_to_name(note.midi)} 使用 ${finger} 指，依据 ${position_reason}；相邻音为${previous}、${next}，${event_reason}，不是按单音名称机械映射。`;
}

function get_measure_melody_midis(measure) {
  const right_midis = measure.events
    .filter((event) =>
      event.hand === "right" &&
      event.teaching_role !== "left_hand_suggestion")
    .flatMap((event) => event.notes.map((note) => note.midi));
  if (right_midis.length > 0) {
    return right_midis;
  }
  return measure.events
    .filter((event) => event.teaching_role !== "left_hand_suggestion")
    .flatMap((event) => event.notes.map((note) => note.midi));
}

function find_measure_lyric(document, measure_id) {
  const event_ids = new Set(
    document.measures.find((measure) => measure.id === measure_id)
      ?.events.map((event) => event.id) ?? [],
  );
  return document.lyrics.find((lyric) =>
    lyric.range?.start.measure_id === measure_id ||
    lyric.range?.end.measure_id === measure_id ||
    lyric.event_ids.some((event_id) => event_ids.has(event_id)));
}

function build_scale_notes(tonic_midi, scale_intervals) {
  const notes = [];
  for (let octave = -8; octave <= 8; octave += 1) {
    for (const interval of scale_intervals) {
      const midi = tonic_midi + octave * 12 + interval;
      if (midi >= 21 && midi <= 108) {
        notes.push(midi);
      }
    }
  }
  return [...new Set(notes)].sort((left, right) => left - right);
}

function get_scale_intervals(key_signature) {
  return is_minor_key(key_signature)
    ? natural_minor_scale_intervals
    : major_scale_intervals;
}

function is_minor_key(key_signature) {
  return /(?:minor|小调|\bm\b)/iu.test(String(key_signature));
}

function covers_all_notes(position, notes) {
  return notes.every((midi) => position.covered_midis.includes(midi));
}

function count_uncovered_notes(position, notes) {
  return notes.filter((midi) => !position.covered_midis.includes(midi)).length;
}

function range_distance(covered_midis, minimum, maximum) {
  return Math.max(0, covered_midis[0] - minimum) +
    Math.max(0, maximum - covered_midis.at(-1));
}

function distance_from(left, right) {
  return Math.abs(left - right);
}

function get_chord_fingers(note_count, hand) {
  const patterns = hand === "left"
    ? {
        1: [5],
        2: [5, 1],
        3: [5, 3, 1],
        4: [5, 3, 2, 1],
        5: [5, 4, 3, 2, 1],
      }
    : {
        1: [1],
        2: [1, 5],
        3: [1, 3, 5],
        4: [1, 2, 3, 5],
        5: [1, 2, 3, 4, 5],
      };
  return patterns[Math.min(5, Math.max(1, note_count))];
}

function get_left_hand_chord_midis(chord, tonic_midi) {
  const match = String(chord).match(/^([A-G])([#b♯♭]?)(m?)/u);
  const root_pitch_class = match
    ? note_name_to_pitch_class(`${match[1]}${match[2]}`)
    : positive_pitch_class(tonic_midi);
  const is_minor = match?.[3] === "m";
  let root = 48 + positive_pitch_class(root_pitch_class - positive_pitch_class(48));
  if (root > 55) {
    root -= 12;
  }
  const intervals = is_minor ? [0, 3, 7] : [0, 4, 7];
  return intervals.map((interval) => root + interval);
}

function note_name_to_pitch_class(name) {
  const normalized = name.replace("♯", "#").replace("♭", "b");
  const letter_pitch_classes = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const base = letter_pitch_classes[normalized[0]] ?? 0;
  const accidental = normalized[1] === "#"
    ? 1
    : normalized[1] === "b"
      ? -1
      : 0;
  return positive_pitch_class(base + accidental);
}

function midi_to_name(midi, prefer_flats = false) {
  const names = prefer_flats ? flat_note_names : sharp_note_names;
  return `${names[positive_pitch_class(midi)]}${Math.floor(midi / 12) - 1}`;
}

function positive_pitch_class(midi) {
  return ((midi % 12) + 12) % 12;
}

function generated_annotation(reason, source_refs = []) {
  return {
    source: "generated",
    status: "candidate",
    reason,
    confirmed_by: null,
    confirmed_at: null,
    source_refs: structuredClone(source_refs),
  };
}

function annotation_for_existing_value(document, reason, source_refs) {
  const source = document.provenance.kind === "pptx"
    ? "pptx"
    : document.provenance.kind === "manual"
      ? "manual"
      : "legacy";
  return {
    source,
    status: source === "legacy" ? "needs_review" : "candidate",
    reason,
    confirmed_by: null,
    confirmed_at: null,
    source_refs: structuredClone(source_refs),
  };
}
