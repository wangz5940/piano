import type {
  score_annotation,
  score_document_event,
  score_document_measure,
  score_document_v2,
  score_hand_position_segment,
  score_lyric,
} from "@/features/score";

import type {
  jianpu_chord_label,
  jianpu_event_markings,
  jianpu_hand,
  jianpu_lyric_label,
  jianpu_render_hand_event,
  jianpu_render_measure,
  jianpu_render_score,
} from "./model";
import {
  get_accidental_preference,
  get_scale_intervals,
  midi_to_jianpu_note,
  midi_to_name,
} from "./pitch";
import { validate_render_score } from "./validate";

interface event_location {
  measure_id: string;
  onset_beats: number;
}

export function to_render_score_from_score_document(
  document: score_document_v2,
  event_markings: Readonly<Record<string, jianpu_event_markings>> = {},
): jianpu_render_score {
  const scale_intervals = get_scale_intervals(document.key_signature);
  const accidental_preference = get_accidental_preference(document.key_signature);
  const event_locations = new Map<string, event_location>();
  document.measures.forEach((measure) => {
    measure.events.forEach((event) => {
      event_locations.set(event.id, {
        measure_id: measure.id,
        onset_beats: event.onset_beats,
      });
    });
  });
  const lyric_labels = build_lyric_labels(document, event_locations);
  const measure_indices = new Map(
    document.measures.map((measure, index) => [measure.id, index]),
  );
  const render_score: jianpu_render_score = {
    id: document.id,
    title: document.title,
    key_signature: document.key_signature,
    tonic_midi: document.tonic_midi,
    scale_intervals,
    accidental_preference,
    time_signature: document.time_signature,
    measures: document.measures.map((measure, index) =>
      normalize_measure(
        document,
        measure,
        index,
        measure_indices,
        lyric_labels.get(measure.id) ?? [],
        scale_intervals,
        accidental_preference,
        event_markings,
      )),
  };
  return validate_render_score(render_score);
}

function normalize_measure(
  document: score_document_v2,
  measure: score_document_measure,
  measure_index: number,
  measure_indices: Map<string, number>,
  lyric_labels: jianpu_lyric_label[],
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
  event_markings: Readonly<Record<string, jianpu_event_markings>>,
): jianpu_render_measure {
  const events = measure.events.map((event, event_index) =>
    normalize_event(
      document,
      event,
      event_index,
      scale_intervals,
      accidental_preference,
      event_markings[event.id],
    ));
  return {
    id: measure.id,
    index: measure_index,
    number: measure.number,
    directions: [],
    meter: { ...measure.meter },
    content_beats: measure.events.reduce(
      (maximum, event) =>
        Math.max(maximum, event.onset_beats + event.duration_beats),
      0,
    ),
    warnings: [],
    hand_position: select_hand_position(
      document.hand_positions,
      measure,
      measure_indices,
    ),
    right: events.filter((event) => event.hand === "right"),
    left: events.filter((event) => event.hand === "left"),
    chord_labels: build_chord_labels(measure),
    lyric_labels,
  };
}

function normalize_event(
  document: score_document_v2,
  event: score_document_event,
  event_index: number,
  scale_intervals: readonly number[],
  accidental_preference: "sharp" | "flat",
  markings?: jianpu_event_markings,
): jianpu_render_hand_event {
  return {
    id: event.id,
    hand: event.hand,
    kind: event.notes.length === 0 ? "rest" : "note",
    onset_beats: event.onset_beats,
    duration_beats: event.duration_beats,
    notes: event.notes.map((note) => {
      const render_note = midi_to_jianpu_note(
        note.midi,
        document.tonic_midi,
        scale_intervals,
        accidental_preference,
      );
      if (note.finger === undefined) {
        return render_note;
      }
      return {
        ...render_note,
        finger: note.finger,
        fingering_source: note.fingering?.source,
        fingering_status: note.fingering?.status,
        fingering_reason: note.fingering?.reason,
      };
    }),
    voice: event.voice,
    tie: event.tie
      ? {
          id: `${event.id}-tie`,
          role: event.tie,
          source_event_id: event.id,
        }
      : undefined,
    markings,
    source_ref: {
      source: "score_document",
      source_id: event.id,
      event_index,
    },
  };
}

function select_hand_position(
  segments: score_hand_position_segment[],
  measure: score_document_measure,
  measure_indices: Map<string, number>,
) {
  const measure_index = measure_indices.get(measure.id);
  if (measure_index === undefined) {
    return undefined;
  }
  const selected = segments
    .filter((segment) =>
      range_contains_measure(segment, measure_index, measure_indices))
    .sort((left, right) =>
      hand_priority(left.hand) - hand_priority(right.hand) ||
      left.id.localeCompare(right.id))[0];
  if (!selected) {
    return undefined;
  }
  const finger_by_midi = new Map(
    selected.finger_map.map((entry) => [entry.midi, String(entry.finger)]),
  );
  return {
    label: selected.position_name,
    notes: selected.covered_midis.map((midi) => midi_to_name(midi)),
    fingers: selected.covered_midis.map((midi) => finger_by_midi.get(midi) ?? "·"),
    movement: selected.movement,
    reason: selected.annotation.reason,
    hand: selected.hand,
    source: selected.annotation.source,
    status: selected.annotation.status,
  };
}

function range_contains_measure(
  segment: score_hand_position_segment,
  measure_index: number,
  measure_indices: Map<string, number>,
): boolean {
  const start = measure_indices.get(segment.range.start.measure_id);
  const end = measure_indices.get(segment.range.end.measure_id);
  return start !== undefined &&
    end !== undefined &&
    measure_index >= start &&
    measure_index <= end;
}

function hand_priority(hand: jianpu_hand): number {
  return hand === "right" ? 0 : 1;
}

function build_chord_labels(
  measure: score_document_measure,
): jianpu_chord_label[] {
  const by_position = new Map<string, jianpu_chord_label>();
  measure.events.forEach((event, event_index) => {
    if (!event.chord) {
      return;
    }
    const candidate: jianpu_chord_label = {
      id: `${measure.id}-chord-${event_index}`,
      onset_beats: event.onset_beats,
      text: event.chord,
      source: event.chord_annotation?.source,
      status: event.chord_annotation?.status,
      reason: event.chord_annotation?.reason,
    };
    const key = `${event.onset_beats}:${event.chord}`;
    const current = by_position.get(key);
    if (
      !current ||
      annotation_priority(candidate.source) > annotation_priority(current.source)
    ) {
      by_position.set(key, candidate);
    }
  });
  return [...by_position.values()].sort((left, right) =>
    left.onset_beats - right.onset_beats ||
    left.id.localeCompare(right.id));
}

function annotation_priority(
  source: score_annotation["source"] | undefined,
): number {
  if (source === "manual") {
    return 4;
  }
  if (source === "pptx") {
    return 3;
  }
  if (source === "legacy") {
    return 2;
  }
  return source === "generated" ? 1 : 0;
}

function build_lyric_labels(
  document: score_document_v2,
  event_locations: Map<string, event_location>,
): Map<string, jianpu_lyric_label[]> {
  const result = new Map<string, jianpu_lyric_label[]>();
  document.lyrics.forEach((lyric) => {
    const placements = get_lyric_placements(
      lyric,
      document.measures[0]?.id,
      event_locations,
    );
    placements.forEach((placement, index) => {
      const current = result.get(placement.measure_id) ?? [];
      current.push({
        id: `${lyric.id}-${index}`,
        onset_beats: placement.onset_beats,
        text: placement.text,
        stanza_number: lyric.stanza_number,
        source: lyric.annotation.source,
        status: lyric.annotation.status,
        reason: lyric.annotation.reason,
      });
      result.set(placement.measure_id, current);
    });
  });
  result.forEach((labels) => {
    labels.sort((left, right) =>
      left.stanza_number - right.stanza_number ||
      left.onset_beats - right.onset_beats ||
      left.id.localeCompare(right.id));
  });
  return result;
}

function get_lyric_placements(
  lyric: score_lyric,
  first_measure_id: string | undefined,
  event_locations: Map<string, event_location>,
) {
  const locations = lyric.event_ids
    .map((event_id) => event_locations.get(event_id))
    .filter((location): location is event_location => Boolean(location));
  const characters = [...lyric.text].filter((character) => !/\s/u.test(character));
  if (locations.length > 0 && characters.length === locations.length) {
    return locations.map((location, index) => ({
      ...location,
      text: characters[index],
    }));
  }
  if (locations[0]) {
    return [{ ...locations[0], text: lyric.text }];
  }
  if (lyric.range) {
    return [{
      measure_id: lyric.range.start.measure_id,
      onset_beats: lyric.range.start.beat,
      text: lyric.text,
    }];
  }
  return first_measure_id
    ? [{ measure_id: first_measure_id, onset_beats: 0, text: lyric.text }]
    : [];
}
