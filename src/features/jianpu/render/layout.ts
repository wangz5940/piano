import type {
  jianpu_event_box,
  jianpu_hand,
  jianpu_hand_row_box,
  jianpu_layout_options,
  jianpu_measure_box,
  jianpu_render_hand_event,
  jianpu_render_measure,
  jianpu_render_score,
  jianpu_score_layout,
  jianpu_system_box,
} from "./model";

const minimum_container_width = 300;
const system_horizontal_padding = 4;
const measure_horizontal_padding = 10;
const note_stack_gap = 20;
const note_body_upper_extent = 22;
const default_fingering_y_offset = 32;
const upper_octave_dot_y_offset = 20;
const octave_dot_radius = 1.45;
const fingering_circle_radius = 7.5;
const note_visual_center_offset = 6;
const minimum_fingering_octave_dot_gap = 7;
const maximum_hold_segment_width = 24;
const minimum_measure_width_by_mode: Record<jianpu_layout_options["mode"], number> = {
  practice: 158,
  reading: 104,
};
const event_density_width_by_mode: Record<jianpu_layout_options["mode"], number> = {
  practice: 21,
  reading: 13,
};
const beat_width_by_mode: Record<jianpu_layout_options["mode"], number> = {
  practice: 36,
  reading: 25,
};

interface measure_system_group {
  measures: jianpu_render_measure[];
  measure_width: number;
}

export function layout_render_score(
  score: jianpu_render_score,
  options: jianpu_layout_options,
): jianpu_score_layout {
  const width = Math.max(minimum_container_width, options.container_width);
  const has_right_hand = score.measures.some((measure) => measure.right.length > 0);
  const has_left_hand = score.measures.some((measure) => measure.left.length > 0);
  const gutter_width = has_right_hand && has_left_hand ? 34 : 22;
  const available_width = width - gutter_width - system_horizontal_padding * 2;
  const measure_groups = group_measures_into_systems(
    score.measures,
    available_width,
    options.mode,
  );

  return {
    width,
    systems: measure_groups.map((group, system_index) =>
      layout_system(
        group.measures,
        system_index,
        system_index === measure_groups.length - 1,
        width,
        group.measure_width,
        gutter_width,
        has_right_hand,
        has_left_hand,
        options.mode,
      )),
  };
}

export function get_bucketed_jianpu_width(width: number): number {
  const bounded = Math.max(minimum_container_width, width);
  return Math.floor(bounded / 40) * 40;
}

function group_measures_into_systems(
  measures: jianpu_render_measure[],
  available_width: number,
  mode: jianpu_layout_options["mode"],
): measure_system_group[] {
  if (measures.length === 0) {
    return [];
  }
  const systems: measure_system_group[] = [];
  const maximum_measures_per_system = get_maximum_measures_per_system(
    available_width,
    mode,
  );
  let current: jianpu_render_measure[] = [];
  let current_target_width = 0;

  const flush = (fill_system: boolean) => {
    if (current.length === 0) {
      return;
    }
    const full_width = available_width / current.length;
    const minimum_four_measure_width = available_width /
      maximum_measures_per_system;
    systems.push({
      measures: current,
      measure_width: fill_system || current.length >= 3
        ? full_width
        : Math.min(
            full_width,
            Math.max(current_target_width, minimum_four_measure_width),
          ),
    });
    current = [];
    current_target_width = 0;
  };

  for (const measure of measures) {
    const target_width = get_minimum_measure_width(measure, mode);
    const next_target_width = Math.max(current_target_width, target_width);
    const exceeds_capacity = current.length > 0 && (
      current.length >= maximum_measures_per_system ||
      next_target_width * (current.length + 1) > available_width
    );
    if (exceeds_capacity) {
      flush(true);
    }
    current.push(measure);
    current_target_width = Math.max(current_target_width, target_width);
  }
  flush(false);
  return systems;
}

function get_maximum_measures_per_system(
  available_width: number,
  mode: jianpu_layout_options["mode"],
): number {
  if (mode === "practice") {
    return 4;
  }
  if (available_width >= 1120) {
    return 8;
  }
  if (available_width >= 960) {
    return 7;
  }
  if (available_width >= 720) {
    return 6;
  }
  return Math.max(1, Math.floor(available_width / minimum_measure_width_by_mode.reading));
}

function layout_system(
  measures: jianpu_render_measure[],
  index: number,
  is_final_system: boolean,
  width: number,
  uniform_measure_width: number,
  gutter_width: number,
  has_right_hand: boolean,
  has_left_hand: boolean,
  mode: jianpu_layout_options["mode"],
): jianpu_system_box {
  const has_two_hands = has_right_hand && has_left_hand;
  const right_metrics = get_hand_row_metrics(measures, "right");
  const left_metrics = get_hand_row_metrics(measures, "left");
  const has_position_labels = mode === "practice" &&
    measures.some((measure) => Boolean(measure.hand_position));
  const first_row_top = has_position_labels ? 39 : 26;
  const right_row = has_right_hand
    ? make_hand_row(
        "right",
        first_row_top,
        right_metrics.height,
        first_row_top + right_metrics.upper_extent,
      )
    : undefined;
  const left_top = has_two_hands && right_row
    ? right_row.top + right_row.height + 14
    : first_row_top;
  const left_row = has_left_hand
    ? make_hand_row(
        "left",
        left_top,
        left_metrics.height,
        left_top + left_metrics.upper_extent,
      )
    : undefined;
  const final_row = left_row ?? right_row;
  const music_height = (final_row?.top ?? first_row_top) +
    (final_row?.height ?? 76) +
    4;
  const has_lyrics = measures.some((measure) => measure.lyric_labels.length > 0);
  const height = music_height + (has_lyrics ? 24 : 0);
  let measure_x = gutter_width + system_horizontal_padding;
  const measure_boxes = measures.map((measure) => {
    const measure_width = uniform_measure_width;
    const box = layout_measure(
      measure,
      measure_x,
      measure_width,
      music_height,
      right_row,
      left_row,
      mode,
    );
    measure_x += measure_width;
    return box;
  });

  return {
    index,
    is_final_system,
    width,
    height,
    has_right_hand,
    has_left_hand,
    gutter_width,
    right_row,
    left_row,
    measures: measure_boxes,
    warnings: measures.flatMap((measure) => measure.warnings),
  };
}

function make_hand_row(
  hand: jianpu_hand,
  top: number,
  height: number,
  baseline: number,
): jianpu_hand_row_box {
  return { hand, top, height, baseline };
}

function get_hand_row_metrics(
  measures: jianpu_render_measure[],
  hand: jianpu_hand,
): { upper_extent: number; height: number } {
  const chord_sizes = measures.flatMap((measure) => {
    const notes_by_onset = new Map<string, number>();
    const events = hand === "right" ? measure.right : measure.left;
    for (const event of events) {
      const key = event.onset_beats.toFixed(4);
      notes_by_onset.set(
        key,
        (notes_by_onset.get(key) ?? 0) + Math.max(1, event.notes.length),
      );
    }
    return [...notes_by_onset.values()];
  });
  const maximum_chord_size = Math.max(1, ...chord_sizes);
  const events = measures.flatMap((measure) =>
    hand === "right" ? measure.right : measure.left);
  const has_fingerings = events.some((event) =>
    event.notes.some((note) => note.finger !== undefined));
  const maximum_fingering_offset = Math.max(
    ...events.flatMap((event) => [get_fingering_y_offset(event.notes)]),
  );
  const upper_extent = (maximum_chord_size - 1) * note_stack_gap +
    Math.max(
      note_body_upper_extent,
      has_fingerings
        ? maximum_fingering_offset + fingering_circle_radius + 4
        : note_body_upper_extent,
    );
  return {
    upper_extent,
    height: upper_extent + 27,
  };
}

function layout_measure(
  measure: jianpu_render_measure,
  x: number,
  width: number,
  height: number,
  right_row: jianpu_hand_row_box | undefined,
  left_row: jianpu_hand_row_box | undefined,
  mode: jianpu_layout_options["mode"],
): jianpu_measure_box {
  const content_x = x + measure_horizontal_padding;
  const content_width = Math.max(24, width - measure_horizontal_padding * 2);
  const layout_beats = mode === "reading"
    ? Math.max(measure.meter.beats, measure.content_beats)
    : measure.meter.beats;

  return {
    measure,
    x,
    y: first_row_top(right_row, left_row),
    width,
    height: height - first_row_top(right_row, left_row) - 2,
    content_x,
    content_width,
    layout_beats,
    right_events: right_row
      ? layout_hand_events(
          measure.right,
          right_row,
          content_x,
          content_width,
          layout_beats,
        )
      : [],
    left_events: left_row
      ? layout_hand_events(
          measure.left,
          left_row,
          content_x,
          content_width,
          layout_beats,
        )
      : [],
  };
}

function first_row_top(
  right_row: jianpu_hand_row_box | undefined,
  left_row: jianpu_hand_row_box | undefined,
): number {
  return right_row?.top ?? left_row?.top ?? 24;
}

function layout_hand_events(
  events: jianpu_render_hand_event[],
  row: jianpu_hand_row_box,
  content_x: number,
  content_width: number,
  layout_beats: number,
): jianpu_event_box[] {
  const stacked_note_counts = new Map<string, number>();
  return events.map((event) => {
    const onset_key = event.onset_beats.toFixed(4);
    const stack_offset = stacked_note_counts.get(onset_key) ?? 0;
    const box = layout_event(
      event,
      row,
      content_x,
      content_width,
      layout_beats,
      stack_offset,
    );
    stacked_note_counts.set(
      onset_key,
      stack_offset + Math.max(1, event.notes.length),
    );
    return box;
  });
}

function layout_event(
  event: jianpu_render_hand_event,
  row: jianpu_hand_row_box,
  content_x: number,
  content_width: number,
  layout_beats: number,
  stack_offset: number,
): jianpu_event_box {
  const bounded_onset = Math.max(0, Math.min(layout_beats, event.onset_beats));
  const x = content_x + bounded_onset / layout_beats * content_width;
  const available_event_width = Math.max(12, content_x + content_width - x);
  const duration_width = event.duration_beats / layout_beats * content_width;
  const width = Math.min(available_event_width, Math.max(18, duration_width));
  const sorted_notes = [...event.notes].sort((left, right) => left.midi - right.midi);
  const note_boxes = sorted_notes.map((note, note_index) => ({
    note,
    x,
    y: row.baseline - (stack_offset + note_index) * note_stack_gap,
  }));
  const slot_width = content_width / layout_beats;
  const highest_y = note_boxes.length > 0
    ? Math.min(...note_boxes.map((note) => note.y))
    : row.baseline;
  const fingering_y_offset = get_fingering_y_offset(event.notes);
  const fingering_boxes = note_boxes.flatMap((note_box, note_index) =>
    note_box.note.finger
      ? [{
          note_midi: note_box.note.midi,
          finger: note_box.note.finger,
          source: note_box.note.fingering_source,
          status: note_box.note.fingering_status,
          reason: note_box.note.fingering_reason,
          x: note_box.x + note_visual_center_offset +
            (note_index - (note_boxes.length - 1) / 2) * 15,
          y: highest_y - fingering_y_offset,
        }]
      : []);
  const hold_segments = build_hold_segments(
    event,
    row,
    content_x,
    content_width,
    layout_beats,
    slot_width,
  );

  return {
    event,
    x,
    y: row.baseline,
    width,
    note_boxes,
    fingering_boxes,
    hold_segments,
  };
}

function get_fingering_y_offset(notes: jianpu_render_hand_event["notes"]): number {
  const has_upper_octave_dot = notes.some((note) =>
    note.finger !== undefined && note.octave_offset > 0);
  if (!has_upper_octave_dot) {
    return default_fingering_y_offset;
  }
  return upper_octave_dot_y_offset +
    octave_dot_radius +
    minimum_fingering_octave_dot_gap +
    fingering_circle_radius;
}

function build_hold_segments(
  event: jianpu_render_hand_event,
  row: jianpu_hand_row_box,
  content_x: number,
  content_width: number,
  layout_beats: number,
  slot_width: number,
) {
  const first_hold_beat = event.kind === "sustain"
    ? event.onset_beats
    : Math.floor(event.onset_beats) + 1;
  const last_hold_beat = Math.min(
    layout_beats,
    event.onset_beats + event.duration_beats,
  );
  const segment_width = Math.min(maximum_hold_segment_width, slot_width * 0.46);
  const segments: Array<{ x: number; y: number; width: number }> = [];

  if (event.kind === "sustain" && event.duration_beats <= 1) {
    const center_x = content_x +
      (event.onset_beats + event.duration_beats / 2) / layout_beats *
        content_width;
    return [{
      x: center_x - segment_width / 2,
      y: row.baseline - 7,
      width: segment_width,
    }];
  }

  for (let beat = first_hold_beat; beat < last_hold_beat - 0.0001; beat += 1) {
    const center_x = content_x + (beat + 0.5) / layout_beats * content_width;
    segments.push({
      x: center_x - segment_width / 2,
      y: row.baseline - 7,
      width: segment_width,
    });
  }
  return segments;
}

function get_minimum_measure_width(
  measure: jianpu_render_measure,
  mode: jianpu_layout_options["mode"],
): number {
  const events = [...measure.right, ...measure.left];
  const unique_onsets = new Set(
    events.map((event) => Number(event.onset_beats.toFixed(4))),
  ).size;
  const maximum_chord_size = Math.max(
    1,
    ...events.map((event) => event.notes.length),
  );
  const layout_beats = mode === "reading"
    ? Math.max(measure.meter.beats, measure.content_beats)
    : measure.meter.beats;
  const density_width = unique_onsets * event_density_width_by_mode[mode];
  const beat_width = layout_beats * beat_width_by_mode[mode];
  const chord_extra = Math.max(0, maximum_chord_size - 1) * 4;

  return Math.max(
    minimum_measure_width_by_mode[mode],
    20 + Math.max(density_width, beat_width) + chord_extra,
  );
}
