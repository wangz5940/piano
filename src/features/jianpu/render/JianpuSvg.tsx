import { memo } from "react";

import type {
  jianpu_event_box,
  jianpu_hold_segment_box,
  jianpu_measure_box,
  jianpu_render_note,
  jianpu_render_view_state,
  jianpu_system_box,
} from "./model";
import {
  get_duration_line_count,
  get_quarter_units,
} from "./pitch";

const simpmusic_accidental_glyphs = {
  "#": "L",
  b: ":",
  natural: '"',
} as const;
const note_visual_center_offset = 6;
const duration_line_width = 16;

interface jianpu_svg_props {
  system: jianpu_system_box;
  score_title?: string;
  show_final_bar: boolean;
  view_state: jianpu_render_view_state;
}

export const JianpuSvg = memo(function JianpuSvg({
  system,
  score_title,
  show_final_bar,
  view_state,
}: jianpu_svg_props) {
  const label = `${score_title ?? "简谱"}第 ${system.index + 1} 行`;
  const brace_top = system.right_row?.top ?? system.left_row?.top ?? 20;
  const brace_bottom = system.left_row
    ? system.left_row.top + system.left_row.height
    : system.right_row
      ? system.right_row.top + system.right_row.height
      : system.height - 8;
  const brace_font_size = Math.max(62, brace_bottom - brace_top + 18);
  const focusable_event_id = system.index === 0
    ? get_first_event_id(system)
    : undefined;
  return (
    <svg
      className="jianpu-svg"
      data-jianpu-system={system.index}
      data-simpmusic-fonts="base accent"
      data-traditional-jianpu="true"
      viewBox={`0 0 ${system.width} ${system.height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMinYMin meet"
    >
      <title>{label}</title>
      {system.has_right_hand && system.has_left_hand ? (
        <text
          className="jianpu-svg-brace"
          data-jianpu-brace="true"
          x="7"
          y={(brace_top + brace_bottom) / 2 + brace_font_size * 0.3}
          style={{ fontSize: `${brace_font_size}px` }}
          aria-hidden="true"
        >
          {"{"}
        </text>
      ) : null}
      {system.measures.map((measure_box, measure_index) => (
        <MeasureSvg
          key={measure_box.measure.id}
          measure_box={measure_box}
          is_first={measure_index === 0}
          is_system_end={measure_index === system.measures.length - 1}
          is_score_end={
            show_final_bar &&
            system.is_final_system &&
            measure_index === system.measures.length - 1
          }
          focusable_event_id={focusable_event_id}
          view_state={view_state}
        />
      ))}
      <SystemSlursSvg system={system} />
    </svg>
  );
}, are_jianpu_svg_props_equal);

function SystemSlursSvg({
  system,
}: {
  system: jianpu_system_box;
}) {
  const slurs: Array<{
    from: jianpu_slur_anchor;
    to: jianpu_slur_anchor;
    lane: string;
  }> = [];
  const active_by_lane = new Map<string, jianpu_slur_anchor[]>();
  for (const event_box of get_ordered_system_event_boxes(system)) {
    const slur = event_box.event.markings?.slur;
    if (!slur || slur === "none" || event_box.event.kind !== "note") {
      continue;
    }
    const lane = get_slur_lane(event_box);
    const anchor = get_jianpu_slur_anchor(event_box);
    if (slur === "start") {
      const active = active_by_lane.get(lane) ?? [];
      active.push(anchor);
      active_by_lane.set(lane, active);
    } else if (slur === "stop") {
      const active = active_by_lane.get(lane) ?? [];
      const start = active.pop();
      if (start) {
        slurs.push({ from: start, to: anchor, lane });
      }
      if (active.length > 0) {
        active_by_lane.set(lane, active);
      } else {
        active_by_lane.delete(lane);
      }
    }
  }

  if (slurs.length === 0) {
    return null;
  }

  return (
    <g className="jianpu-svg-slur-layer">
      {slurs.map((slur) => (
        <path
          key={`${slur.from.event_id}-${slur.to.event_id}`}
          className="jianpu-svg-slur"
          data-slur-from={slur.from.event_id}
          data-slur-to={slur.to.event_id}
          data-slur-lane={slur.lane}
          d={get_jianpu_slur_path(slur.from, slur.to)}
        />
      ))}
    </g>
  );
}

interface jianpu_slur_anchor {
  event_id: string;
  x: number;
  y: number;
}

function get_ordered_system_event_boxes(
  system: jianpu_system_box,
): jianpu_event_box[] {
  return system.measures.flatMap((measure) =>
    [...measure.right_events, ...measure.left_events]
      .sort((a, b) =>
        a.event.onset_beats - b.event.onset_beats ||
        get_event_voice(a) - get_event_voice(b)));
}

function get_slur_lane(event_box: jianpu_event_box): string {
  return event_box.event.hand;
}

function get_event_voice(event_box: jianpu_event_box): number {
  return event_box.event.voice ?? (event_box.event.hand === "left" ? 2 : 1);
}

function get_jianpu_slur_anchor(event_box: jianpu_event_box): jianpu_slur_anchor {
  const note_center_x = event_box.note_boxes.length > 0
    ? event_box.note_boxes.reduce((sum, box) =>
        sum + box.x + note_visual_center_offset, 0) / event_box.note_boxes.length
    : event_box.x + note_visual_center_offset;
  const note_top = event_box.note_boxes.length > 0
    ? Math.min(...event_box.note_boxes.map((box) => box.y))
    : event_box.y;
  return {
    event_id: event_box.event.id,
    x: note_center_x,
    y: note_top - 14,
  };
}

function get_jianpu_slur_path(
  from: jianpu_slur_anchor,
  to: jianpu_slur_anchor,
): string {
  const control_x = (from.x + to.x) / 2;
  const horizontal_distance = Math.abs(to.x - from.x);
  const lift = Math.max(8, Math.min(18, horizontal_distance * 0.08));
  const control_y = Math.min(from.y, to.y) - lift;
  return `M ${from.x} ${from.y} Q ${control_x} ${control_y} ${to.x} ${to.y}`;
}

function MeasureSvg({
  measure_box,
  is_first,
  is_system_end,
  is_score_end,
  focusable_event_id,
  view_state,
}: {
  measure_box: jianpu_measure_box;
  is_first: boolean;
  is_system_end: boolean;
  is_score_end: boolean;
  focusable_event_id?: string;
  view_state: jianpu_render_view_state;
}) {
  const { measure } = measure_box;
  const bar_top = measure_box.y;
  const bar_bottom = measure_box.y + measure_box.height;
  const annotation_y = Math.max(12, bar_top - 12);
  return (
    <g
      className="jianpu-svg-measure"
      data-measure-index={measure.index}
      data-warning-count={measure.warnings.length}
      data-hand-position={measure.hand_position?.label}
      data-position-movement={measure.hand_position?.movement}
    >
      {view_state.mode === "practice" && measure.hand_position && (
        <g
          className={`jianpu-svg-position-band is-${measure.hand_position.movement}`}
          data-annotation-source={measure.hand_position.source}
          data-annotation-status={measure.hand_position.status}
        >
          <title>{measure.hand_position.reason}</title>
          <rect
            x={measure_box.x + 4}
            y="3"
            width={Math.max(30, measure_box.width - 8)}
            height="14"
            rx="2"
          />
          <text
            className="jianpu-svg-position-label"
            x={measure_box.content_x}
            y="13"
          >
            {format_position_label(measure.hand_position.label, measure.hand_position.movement)}
          </text>
          <text
            className="jianpu-svg-position-map"
            x={measure_box.x + measure_box.width - 8}
            y="13"
          >
            {measure.hand_position.notes.join(" ")} / {measure.hand_position.fingers.join("")}
          </text>
        </g>
      )}
      {is_first && (
        <text
          className="jianpu-svg-system-measure-number"
          x="3"
          y={annotation_y}
        >
          ({measure.number})
        </text>
      )}
      {is_first && (
        <line
          className="jianpu-svg-barline"
          x1={measure_box.x}
          y1={bar_top}
          x2={measure_box.x}
          y2={bar_bottom}
        />
      )}
      {measure.directions.length > 0 && (
        <text
          className="jianpu-svg-direction"
          x={measure_box.content_x}
          y={annotation_y}
        >
          {measure.directions.join(" · ")}
        </text>
      )}
      {measure.chord_labels.map((label) => (
        <g
          key={label.id}
          data-annotation-source={label.source}
          data-annotation-status={label.status}
        >
          {label.reason && <title>{label.reason}</title>}
          <text
            className="jianpu-svg-chord-label"
            x={get_timeline_x(measure_box, label.onset_beats)}
            y={annotation_y}
          >
            {label.text}
          </text>
        </g>
      ))}
      {measure.warnings.length > 0 && (
        <title>{measure.warnings.map((warning) => warning.message).join("；")}</title>
      )}
      {measure_box.right_events.map((event_box) => (
        <EventSvg
          key={event_box.event.id}
          event_box={event_box}
          beat_unit={measure.meter.beat_unit}
          focusable={event_box.event.id === focusable_event_id}
          view_state={view_state}
        />
      ))}
      {measure_box.left_events.map((event_box) => (
        <EventSvg
          key={event_box.event.id}
          event_box={event_box}
          beat_unit={measure.meter.beat_unit}
          focusable={event_box.event.id === focusable_event_id}
          view_state={view_state}
        />
      ))}
      {measure.lyric_labels.map((label) => (
        <g
          key={label.id}
          data-annotation-source={label.source}
          data-annotation-status={label.status}
        >
          <title>{label.reason}</title>
          <text
            className="jianpu-svg-lyric"
            x={get_timeline_x(measure_box, label.onset_beats)}
            y={measure_box.y + measure_box.height + 16}
          >
            {label.text}
          </text>
        </g>
      ))}
      <line
        className={`jianpu-svg-barline ${is_system_end ? "is-system-end" : ""}`}
        x1={measure_box.x + measure_box.width}
        y1={bar_top}
        x2={measure_box.x + measure_box.width}
        y2={bar_bottom}
      />
      {is_score_end && (
        <line
          className="jianpu-svg-barline is-final"
          x1={measure_box.x + measure_box.width - 4}
          y1={bar_top}
          x2={measure_box.x + measure_box.width - 4}
          y2={bar_bottom}
        />
      )}
    </g>
  );
}

function format_position_label(
  label: string,
  movement: "stay" | "move" | "return",
): string {
  if (movement === "move") {
    return label.startsWith("Move to ") ? label : `Move to ${label}`;
  }
  if (movement === "return") {
    return label.startsWith("Return to ") ? label : `Return to ${label}`;
  }
  return label.startsWith("Position: ") ? label : `Position: ${label}`;
}

function EventSvg({
  event_box,
  beat_unit,
  focusable,
  view_state,
}: {
  event_box: jianpu_event_box;
  beat_unit: number;
  focusable: boolean;
  view_state: jianpu_render_view_state;
}) {
  const { event } = event_box;
  const is_current = event.source_ref.source_id === view_state.current_event_id;
  const is_done = view_state.completed_event_ids.has(event.source_ref.source_id);
  const duration_line_count = get_duration_line_count(
    event.duration_beats,
    beat_unit,
  );
  const event_label = get_event_label(event_box);
  const event_top = Math.min(
    event_box.y - 30,
    ...event_box.note_boxes.map((box) => box.y - 29),
    ...event_box.fingering_boxes.map((box) => box.y - 10),
  );
  const event_bottom = event_box.y + 24;
  const class_name = [
    "jianpu-svg-event",
    `is-${event.kind}`,
    is_current ? "is-current" : "",
    is_done ? "is-done" : "",
  ].filter(Boolean).join(" ");

  return (
    <g
      className={class_name}
      data-event-id={event.id}
      data-source-id={event.source_ref.source_id}
      data-hand={event.hand}
      data-onset={event.onset_beats}
      data-duration-lines={duration_line_count}
      data-dynamics={event.markings?.dynamics || undefined}
      data-articulation={event.markings?.articulation || undefined}
      data-slur={
        event.markings?.slur && event.markings.slur !== "none"
          ? event.markings.slur
          : undefined
      }
      aria-label={event_label}
      aria-current={is_current ? "step" : undefined}
      role={view_state.on_event_select ? "button" : "img"}
      tabIndex={
        view_state.on_event_select ||
        is_current ||
        (!view_state.current_event_id && focusable)
          ? 0
          : -1
      }
      onClick={() => view_state.on_event_select?.(event.source_ref.source_id)}
      onKeyDown={(keyboard_event) => {
        if (
          view_state.on_event_select &&
          (keyboard_event.key === "Enter" || keyboard_event.key === " ")
        ) {
          keyboard_event.preventDefault();
          view_state.on_event_select(event.source_ref.source_id);
        }
      }}
    >
      {is_current && (
        <rect
          className="jianpu-svg-current-background"
          x={event_box.x - 12}
          y={event_top}
          width={Math.max(25, event_box.width)}
          height={event_bottom - event_top}
          rx="5"
        />
      )}
      {event.kind === "sustain" && (
        <SustainSvg event_box={event_box} />
      )}
      {event.kind === "rest" && (
        <text
          className="jianpu-svg-rest"
          data-simpmusic-font="base"
          x={event_box.x}
          y={event_box.y}
          textAnchor="middle"
        >
          0
        </text>
      )}
      {event.kind === "note" && (
        <>
          {event_box.note_boxes.map((note_box) => (
            <NoteSvg
              key={`${event.id}-${note_box.note.midi}`}
              note={note_box.note}
              x={note_box.x}
              y={note_box.y}
            />
          ))}
          <DurationLinesSvg
            event_box={event_box}
            line_count={duration_line_count}
          />
          <AugmentationDotsSvg
            event_box={event_box}
            count={get_augmentation_dot_count(
              event.duration_beats,
              beat_unit,
            )}
          />
          <HoldSegmentsSvg segments={event_box.hold_segments} />
          {event.tie && (
            <text
              className="jianpu-svg-tie"
              data-simpmusic-font="accent"
              data-tie-id={event.tie.id}
              x={event_box.x + event_box.width / 2 - 6}
              y={event_box.y - 12}
              textAnchor="middle"
              textLength={Math.max(20, event_box.width)}
              lengthAdjust="spacingAndGlyphs"
              aria-hidden="true"
            >
              -
            </text>
          )}
        </>
      )}
      {view_state.show_fingerings && event_box.fingering_boxes.map((box) => (
        <g
          key={`${event.id}-finger-${box.note_midi}`}
          className="jianpu-svg-fingering"
          data-fingering={box.finger}
          data-annotation-source={box.source}
          data-annotation-status={box.status}
        >
          {box.reason && <title>{box.reason}</title>}
          <circle cx={box.x} cy={box.y} r="7.5" />
          <text x={box.x} y={box.y + 3} textAnchor="middle">
            {box.finger}
          </text>
        </g>
      ))}
      {view_state.show_keyboard_aid && event.notes.length > 0 && (
        <text
          className="jianpu-svg-keyboard-label"
          x={event_box.x}
          y={event_box.y + 30}
          textAnchor="middle"
        >
          {event.notes.map((note) => note.keyboard_label).join("+")}
        </text>
      )}
      <JianpuMarkings event_box={event_box} />
    </g>
  );
}

function JianpuMarkings({
  event_box,
}: {
  event_box: jianpu_event_box;
}) {
  const markings = event_box.event.markings;
  if (!markings) {
    return null;
  }
  const center_x = event_box.x + event_box.width / 2 - 6;
  return (
    <g className="jianpu-svg-markings">
      {markings.articulation && (
        <text
          className="jianpu-svg-articulation"
          x={center_x}
          y={event_box.y - 12}
          textAnchor="middle"
        >
          {format_articulation(markings.articulation)}
        </text>
      )}
      {markings.dynamics && (
        <text
          className="jianpu-svg-dynamics"
          x={center_x}
          y={event_box.y + 20}
          textAnchor="middle"
        >
          {markings.dynamics}
        </text>
      )}
    </g>
  );
}

function format_articulation(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "staccato") return "·";
  if (normalized === "accent") return ">";
  if (normalized === "tenuto") return "–";
  return value;
}

function NoteSvg({
  note,
  x,
  y,
}: {
  note: jianpu_render_note;
  x: number;
  y: number;
}) {
  return (
    <g className="jianpu-svg-note" data-midi={note.midi}>
      {note.accidental && (
        <text
          className="jianpu-svg-accidental"
          data-simpmusic-font="base"
          data-jianpu-accidental={note.accidental}
          x={x - 13}
          y={y}
          textAnchor="middle"
        >
          {simpmusic_accidental_glyphs[note.accidental]}
        </text>
      )}
      <text
        className="jianpu-svg-degree"
        data-simpmusic-font="base"
        x={x}
        y={y}
        textAnchor="start"
      >
        {note.degree}
      </text>
      <OctaveDots
        count={Math.abs(note.octave_offset)}
        x={x + note_visual_center_offset}
        y={note.octave_offset > 0 ? y - 20 : y + 12}
      />
    </g>
  );
}

function OctaveDots({
  count,
  x,
  y,
}: {
  count: number;
  x: number;
  y: number;
}) {
  if (count === 0) {
    return null;
  }
  const spacing = 5;
  const start_x = x - (count - 1) * spacing / 2;
  return (
    <g className="jianpu-svg-octave-dots" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <circle key={index} cx={start_x + index * spacing} cy={y} r="1.45" />
      ))}
    </g>
  );
}

function DurationLinesSvg({
  event_box,
  line_count,
}: {
  event_box: jianpu_event_box;
  line_count: number;
}) {
  if (line_count === 0) {
    return null;
  }
  return (
    <g className="jianpu-svg-duration-lines" aria-hidden="true">
      {event_box.note_boxes.flatMap((box) => {
        const first_line_y = box.note.octave_offset < 0
          ? box.y + 18 + Math.abs(box.note.octave_offset) * 5
          : box.y + 8;
        return Array.from({ length: line_count }, (_, index) => (
          <line
            key={`${box.note.midi}-${index}`}
            x1={box.x}
            y1={first_line_y + index * 4}
            x2={box.x + duration_line_width}
            y2={first_line_y + index * 4}
          />
        ));
      })}
    </g>
  );
}

function AugmentationDotsSvg({
  event_box,
  count,
}: {
  event_box: jianpu_event_box;
  count: number;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <g className="jianpu-svg-augmentation-dots" aria-hidden="true">
      {event_box.note_boxes.flatMap((box) =>
        Array.from({ length: count }, (_, index) => (
          <circle
            key={`${box.note.midi}-${index}`}
            cx={box.x + duration_line_width + 4 + index * 5}
            cy={box.y - 6}
            r="1.35"
          />
        )))}
    </g>
  );
}

function get_augmentation_dot_count(
  duration_beats: number,
  beat_unit: number,
): number {
  const quarter_units = get_quarter_units(duration_beats, beat_unit);
  for (const base of [4, 2, 1, 0.5, 0.25, 0.125]) {
    const ratio = quarter_units / base;
    if (Math.abs(ratio - 1.5) < 0.002) {
      return 1;
    }
    if (Math.abs(ratio - 1.75) < 0.002) {
      return 2;
    }
    if (Math.abs(ratio - 1.875) < 0.002) {
      return 3;
    }
  }
  return 0;
}

function HoldSegmentsSvg({
  segments,
}: {
  segments: jianpu_hold_segment_box[];
}) {
  if (segments.length === 0) {
    return null;
  }
  return (
    <g className="jianpu-svg-hold-segments" data-jianpu-hold-count={segments.length}>
      {segments.map((segment, index) => (
        <line
          key={`${segment.x}-${index}`}
          className="jianpu-svg-hold-line"
          data-jianpu-hold="true"
          x1={segment.x}
          y1={segment.y}
          x2={segment.x + segment.width}
          y2={segment.y}
        />
      ))}
    </g>
  );
}

function SustainSvg({ event_box }: { event_box: jianpu_event_box }) {
  return (
    <g className="jianpu-svg-sustain" data-jianpu-sustain="true">
      <HoldSegmentsSvg segments={event_box.hold_segments} />
    </g>
  );
}

function get_event_label(event_box: jianpu_event_box): string {
  const { event } = event_box;
  const hand = event.hand === "right" ? "右手" : "左手";
  if (event.kind === "sustain") {
    return `${hand}延音保持 ${event.duration_beats} 拍`;
  }
  if (event.kind === "rest") {
    return `${hand}休止 ${event.duration_beats} 拍`;
  }
  const notes = event.notes.map((note) => note.keyboard_label).join("、");
  return `${hand}${notes}，${event.duration_beats} 拍`;
}

function get_timeline_x(
  measure_box: jianpu_measure_box,
  onset_beats: number,
): number {
  const bounded = Math.max(0, Math.min(measure_box.layout_beats, onset_beats));
  return measure_box.content_x +
    bounded / measure_box.layout_beats * measure_box.content_width;
}

function get_first_event_id(system: jianpu_system_box): string | undefined {
  return system.measures
    .flatMap((measure) => [
      ...measure.right_events,
      ...measure.left_events,
    ])
    .sort((left, right) =>
      left.event.onset_beats - right.event.onset_beats)[0]
    ?.event.id;
}

function are_jianpu_svg_props_equal(
  previous: jianpu_svg_props,
  next: jianpu_svg_props,
): boolean {
  if (previous.system !== next.system ||
    previous.score_title !== next.score_title ||
    previous.show_final_bar !== next.show_final_bar ||
    previous.view_state.mode !== next.view_state.mode ||
    previous.view_state.show_fingerings !== next.view_state.show_fingerings ||
    previous.view_state.show_keyboard_aid !== next.view_state.show_keyboard_aid) {
    return false;
  }

  const source_ids = new Set(
    previous.system.measures.flatMap((measure) => [
      ...measure.right_events,
      ...measure.left_events,
    ]).map((event_box) => event_box.event.source_ref.source_id),
  );
  for (const source_id of source_ids) {
    if ((previous.view_state.current_event_id === source_id) !==
      (next.view_state.current_event_id === source_id) ||
      previous.view_state.completed_event_ids.has(source_id) !==
      next.view_state.completed_event_ids.has(source_id)) {
      return false;
    }
  }
  return true;
}
