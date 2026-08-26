import type {
  jianpu_render_hand_event,
  jianpu_render_measure,
  jianpu_render_score,
} from "./model";

const measures_per_system = 4;
const measure_width = 176;
const left_margin = 76;

export interface staff_aid_renderer_props {
  score: jianpu_render_score;
  current_event_id?: string;
  on_event_select?: (event_id: string) => void;
  show_fingerings?: boolean;
  group_by_hand?: boolean;
  className?: string;
}

export function StaffAidRenderer({
  score,
  current_event_id,
  on_event_select,
  show_fingerings = false,
  group_by_hand = false,
  className = "",
}: staff_aid_renderer_props) {
  if (group_by_hand && score_has_hand(score, "right") && score_has_hand(score, "left")) {
    return (
      <div
        className={`staff-aid-renderer staff-aid-renderer-by-hand ${className}`.trim()}
        data-staff-aid="true"
        data-staff-aid-layout="by-hand"
        data-score-document={score.id}
        data-key-signature={score.key_signature}
        data-time-signature={score.time_signature}
      >
        {(["right", "left"] as const).map((hand) => (
          <section
            key={hand}
            className="staff-aid-hand-panel"
            data-staff-aid-hand={hand}
            aria-label={hand === "right" ? "右手独立五线谱" : "左手独立五线谱"}
          >
            <div className="staff-aid-hand-label">
              {hand === "right" ? "右手" : "左手"}
            </div>
            <StaffAidRenderer
              score={filter_score_by_hand(score, hand)}
              current_event_id={current_event_id}
              on_event_select={on_event_select}
              show_fingerings={show_fingerings}
              className="staff-aid-hand-score"
            />
          </section>
        ))}
      </div>
    );
  }

  const systems = chunk_measures(score.measures);
  const has_treble = score_has_staff(score, "treble");
  const has_bass = score_has_staff(score, "bass");
  const has_two_staves = has_treble && has_bass;
  const system_layouts = systems.map((measures) => ({
    measures,
    height: (has_two_staves ? 196 : 122) +
      (measures.some((measure) => measure.lyric_labels.length > 0) ? 24 : 0),
  }));
  const maximum_measure_count = Math.max(
    1,
    ...systems.map((system) => system.length),
  );
  const width = left_margin + maximum_measure_count * measure_width + 16;
  const height = system_layouts.reduce(
    (sum, system) => sum + system.height,
    16,
  );
  let system_top = 8;

  return (
    <div
      className={`staff-aid-renderer ${className}`.trim()}
      data-staff-aid="true"
      data-score-document={score.id}
      data-key-signature={score.key_signature}
      data-time-signature={score.time_signature}
    >
      <svg
        className="staff-score"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        role="img"
        aria-label={`${score.title ?? "乐谱"}五线谱辅助视图`}
      >
        {system_layouts.map((system, system_index) => {
          const top = system_top;
          system_top += system.height;
          return (
            <StaffSystem
              key={system_index}
              measures={system.measures}
              system_index={system_index}
              top={top}
              key_signature={score.key_signature}
              has_treble={has_treble}
              has_bass={has_bass}
              has_two_staves={has_two_staves}
              show_fingerings={show_fingerings}
              current_event_id={current_event_id}
              on_event_select={on_event_select}
            />
          );
        })}
      </svg>
    </div>
  );
}

function score_has_hand(
  score: jianpu_render_score,
  hand: "right" | "left",
): boolean {
  return score.measures.some((measure) => measure[hand].length > 0);
}

function filter_score_by_hand(
  score: jianpu_render_score,
  hand: "right" | "left",
): jianpu_render_score {
  return {
    ...score,
    id: `${score.id}-${hand}`,
    measures: score.measures.map((measure) => ({
      ...measure,
      hand_position: measure.hand_position?.hand &&
          measure.hand_position.hand !== hand
        ? undefined
        : measure.hand_position,
      right: hand === "right" ? measure.right : [],
      left: hand === "left" ? measure.left : [],
    })),
  };
}

function StaffSystem({
  measures,
  system_index,
  top,
  key_signature,
  has_treble,
  has_bass,
  has_two_staves,
  show_fingerings,
  current_event_id,
  on_event_select,
}: {
  measures: jianpu_render_measure[];
  system_index: number;
  top: number;
  key_signature: string;
  has_treble: boolean;
  has_bass: boolean;
  has_two_staves: boolean;
  show_fingerings: boolean;
  current_event_id?: string;
  on_event_select?: (event_id: string) => void;
}) {
  const staff_top = top + 45;
  const bass_staff_top = staff_top + (has_two_staves ? 82 : 0);
  const staff_width = measures.length * measure_width;
  const lyric_y = bass_staff_top + 76;
  return (
    <g data-staff-system={system_index}>
      {has_treble && (
        <>
          <StaffLines top={staff_top} width={staff_width} />
          <text className="staff-clef" x="16" y={staff_top + 39}>𝄞</text>
        </>
      )}
      {has_bass && (
        <>
          <StaffLines top={bass_staff_top} width={staff_width} />
          <text
            className="staff-clef staff-bass-clef"
            x="22"
            y={bass_staff_top + 35}
          >
            𝄢
          </text>
        </>
      )}
      {system_index === 0 && (
        <>
          <text className="staff-key-signature" x={left_margin} y={top + 12}>
            {key_signature}
          </text>
          <text className="staff-time-signature" x="56" y={staff_top + 24}>
            {measures[0]?.meter.beats}
            <tspan x="56" dy="17">{measures[0]?.meter.beat_unit}</tspan>
          </text>
        </>
      )}
      {has_treble && (
        <StaffSystemSlurs
          measures={measures}
          staff="treble"
          top={staff_top}
        />
      )}
      {has_treble && (
        <StaffSystemTies
          measures={measures}
          staff="treble"
          top={staff_top}
        />
      )}
      {has_bass && (
        <StaffSystemSlurs
          measures={measures}
          staff="bass"
          top={bass_staff_top}
        />
      )}
      {has_bass && (
        <StaffSystemTies
          measures={measures}
          staff="bass"
          top={bass_staff_top}
        />
      )}
      {measures.map((measure, offset) => (
        <StaffMeasure
          key={measure.id}
          measure={measure}
          x={left_margin + offset * measure_width}
          width={measure_width}
          staff_top={staff_top}
          bass_staff_top={bass_staff_top}
          lyric_y={lyric_y}
          has_treble={has_treble}
          has_bass={has_bass}
          has_two_staves={has_two_staves}
          show_fingerings={show_fingerings}
          current_event_id={current_event_id}
          on_event_select={on_event_select}
          is_last={offset === measures.length - 1}
        />
      ))}
    </g>
  );
}

function StaffSystemSlurs({
  measures,
  staff,
  top,
}: {
  measures: jianpu_render_measure[];
  staff: "treble" | "bass";
  top: number;
}) {
  const slurs: Array<{
    from: staff_slur_anchor;
    to: staff_slur_anchor;
    lane: string;
  }> = [];
  const active_by_lane = new Map<string, staff_slur_anchor[]>();
  measures.forEach((measure, measure_offset) => {
    const measure_x = left_margin + measure_offset * measure_width;
    const events = [...measure.right, ...measure.left]
      .filter((event) =>
        event.notes.length > 0 && display_staff_for_event(event) === staff)
      .sort((a, b) =>
        a.onset_beats - b.onset_beats || event_voice(a) - event_voice(b));
    for (const event of events) {
      const slur = event.markings?.slur;
      if (!slur || slur === "none") {
        continue;
      }
      const anchor = get_staff_slur_anchor(event, measure, measure_x, top, staff);
      const lane = slur_lane(event);
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
  });

  return (
    <g className="staff-slur-layer">
      {slurs.map((slur) => (
        <path
          key={`${slur.from.event_id}-${slur.to.event_id}`}
          className="staff-slur"
          data-slur-from={slur.from.event_id}
          data-slur-to={slur.to.event_id}
          data-slur-lane={slur.lane}
          d={staff_slur_path(slur.from, slur.to, staff)}
        />
      ))}
    </g>
  );
}

interface staff_slur_anchor {
  event_id: string;
  x: number;
  y: number;
}

function get_staff_slur_anchor(
  event: jianpu_render_hand_event,
  measure: jianpu_render_measure,
  x: number,
  top: number,
  staff: "treble" | "bass",
): staff_slur_anchor {
  const note_x = timeline_x(x, measure_width, measure.meter.beats, event.onset_beats);
  const note_y = event.notes
    .map((note) => staff_y(note.midi, top, staff))
    .reduce((sum, y) => sum + y, 0) / event.notes.length;
  return {
    event_id: event.id,
    x: note_x,
    y: staff === "treble" ? note_y - 14 : note_y + 16,
  };
}

function staff_slur_path(
  from: staff_slur_anchor,
  to: staff_slur_anchor,
  staff: "treble" | "bass",
): string {
  const lift = Math.max(18, Math.min(36, Math.abs(to.x - from.x) * 0.18));
  const control_y = staff === "treble"
    ? Math.min(from.y, to.y) - lift
    : Math.max(from.y, to.y) + lift;
  return `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${control_y} ${to.x} ${to.y}`;
}

function StaffSystemTies({
  measures,
  staff,
  top,
}: {
  measures: jianpu_render_measure[];
  staff: "treble" | "bass";
  top: number;
}) {
  const ties: Array<{
    from: staff_tie_anchor;
    to: staff_tie_anchor;
    lane: string;
  }> = [];
  const active_by_lane = new Map<string, staff_tie_anchor>();
  measures.forEach((measure, measure_offset) => {
    const measure_x = left_margin + measure_offset * measure_width;
    const events = [...measure.right, ...measure.left]
      .filter((event) =>
        event.notes.length > 0 &&
        event.tie &&
        display_staff_for_event(event) === staff)
      .sort((a, b) =>
        a.onset_beats - b.onset_beats || event_voice(a) - event_voice(b));
    for (const event of events) {
      const tie_role = event.tie?.role;
      for (const note of event.notes) {
        const lane = tie_lane(event, note.midi);
        const anchor = get_staff_tie_anchor(event, note.midi, measure, measure_x, top, staff);
        if (tie_role === "start") {
          active_by_lane.set(lane, anchor);
          continue;
        }
        const start = active_by_lane.get(lane);
        if (start) {
          ties.push({ from: start, to: anchor, lane });
        }
        if (tie_role === "continue") {
          active_by_lane.set(lane, anchor);
        } else {
          active_by_lane.delete(lane);
        }
      }
    }
  });

  return (
    <g className="staff-tie-layer">
      {ties.map((tie) => (
        <path
          key={`${tie.from.event_id}-${tie.to.event_id}-${tie.lane}`}
          className="staff-tie"
          data-tie-from={tie.from.event_id}
          data-tie-to={tie.to.event_id}
          data-tie-lane={tie.lane}
          d={staff_tie_path(tie.from, tie.to)}
        />
      ))}
    </g>
  );
}

interface staff_tie_anchor {
  event_id: string;
  x: number;
  y: number;
}

function get_staff_tie_anchor(
  event: jianpu_render_hand_event,
  midi: number,
  measure: jianpu_render_measure,
  x: number,
  top: number,
  staff: "treble" | "bass",
): staff_tie_anchor {
  const note_x = timeline_x(x, measure_width, measure.meter.beats, event.onset_beats);
  const note_y = staff_y(midi, top, staff);
  return {
    event_id: event.id,
    x: note_x + 6,
    y: note_y + 8,
  };
}

function staff_tie_path(
  from: staff_tie_anchor,
  to: staff_tie_anchor,
): string {
  const lift = Math.max(5, Math.min(11, Math.abs(to.x - from.x) * 0.08));
  const control_y = Math.max(from.y, to.y) + lift;
  return `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${control_y} ${to.x} ${to.y}`;
}

function slur_lane(event: jianpu_render_hand_event): string {
  return event.hand;
}

function tie_lane(event: jianpu_render_hand_event, midi: number): string {
  return `${event.hand}:${event_voice(event)}:${midi}`;
}

function event_voice(event: jianpu_render_hand_event): number {
  return event.voice ?? (event.hand === "left" ? 2 : 1);
}

function StaffMeasure({
  measure,
  x,
  width,
  staff_top,
  bass_staff_top,
  lyric_y,
  has_treble,
  has_bass,
  has_two_staves,
  show_fingerings,
  current_event_id,
  on_event_select,
  is_last,
}: {
  measure: jianpu_render_measure;
  x: number;
  width: number;
  staff_top: number;
  bass_staff_top: number;
  lyric_y: number;
  has_treble: boolean;
  has_bass: boolean;
  has_two_staves: boolean;
  show_fingerings: boolean;
  current_event_id?: string;
  on_event_select?: (event_id: string) => void;
  is_last: boolean;
}) {
  const bar_bottom = (has_bass ? bass_staff_top : staff_top) + 40;
  const staff_events = [...measure.right, ...measure.left];
  const treble_events = staff_events.filter((event) =>
    display_staff_for_event(event) === "treble");
  const bass_events = staff_events.filter((event) =>
    display_staff_for_event(event) === "bass");
  return (
    <g
      data-measure-index={measure.index}
      data-position-movement={measure.hand_position?.movement}
    >
      {measure.hand_position && (
        <g
          className={`staff-position-band is-${measure.hand_position.movement}`}
          data-annotation-source={measure.hand_position.source}
          data-annotation-status={measure.hand_position.status}
        >
          <title>{measure.hand_position.reason}</title>
          <rect x={x + 4} y={staff_top - 30} width={width - 8} height="17" rx="6" />
          <text className="staff-position-label" x={x + 9} y={staff_top - 18}>
            {format_position_label(
              measure.hand_position.label,
              measure.hand_position.movement,
            )}
          </text>
          <text
            className="staff-position-map"
            x={x + width - 8}
            y={staff_top - 18}
          >
            {measure.hand_position.notes.join(" ")} / {measure.hand_position.fingers.join("")}
          </text>
        </g>
      )}
      <line
        className="staff-barline"
        x1={x}
        y1={staff_top}
        x2={x}
        y2={bar_bottom}
      />
      {is_last && (
        <line
          className="staff-barline is-final"
          x1={x + width}
          y1={staff_top}
          x2={x + width}
          y2={bar_bottom}
        />
      )}
      {measure.chord_labels.map((label) => (
        <g
          key={label.id}
          data-annotation-source={label.source}
          data-annotation-status={label.status}
        >
          {label.reason && <title>{label.reason}</title>}
          <text
            className="staff-chord-label"
            x={timeline_x(x, width, measure.meter.beats, label.onset_beats)}
            y={staff_top - 4}
          >
            {label.text}
          </text>
        </g>
      ))}
      {has_treble && treble_events.map((event) => (
        <StaffEvent
          key={event.id}
          event={event}
          measure={measure}
          x={x}
          width={width}
          top={staff_top}
          staff="treble"
          show_fingerings={show_fingerings}
          is_current={event.id === current_event_id}
          on_event_select={on_event_select}
        />
      ))}
      {has_bass && bass_events.map((event) => (
        <StaffEvent
          key={event.id}
          event={event}
          measure={measure}
          x={x}
          width={width}
          top={bass_staff_top}
          staff="bass"
          show_fingerings={show_fingerings}
          is_current={event.id === current_event_id}
          on_event_select={on_event_select}
        />
      ))}
      {measure.lyric_labels.map((label) => (
        <text
          key={label.id}
          className="staff-lyric"
          x={timeline_x(x, width, measure.meter.beats, label.onset_beats)}
          y={has_two_staves ? lyric_y : bar_bottom + 25}
          data-annotation-source={label.source}
          data-annotation-status={label.status}
        >
          <title>{label.reason}</title>
          {label.text}
        </text>
      ))}
    </g>
  );
}

function StaffEvent({
  event,
  measure,
  x,
  width,
  top,
  staff,
  show_fingerings,
  is_current,
  on_event_select,
}: {
  event: jianpu_render_hand_event;
  measure: jianpu_render_measure;
  x: number;
  width: number;
  top: number;
  staff: "treble" | "bass";
  show_fingerings: boolean;
  is_current: boolean;
  on_event_select?: (event_id: string) => void;
}) {
  const note_x = timeline_x(
    x,
    width,
    measure.meter.beats,
    event.onset_beats,
  );
  const duration_kind = get_staff_duration_kind(
    event.duration_beats,
    measure.meter.beat_unit,
  );
  const class_name = [
    "staff-note-group",
    event.kind === "rest" ? "is-rest" : "",
    is_current ? "is-current" : "",
  ].filter(Boolean).join(" ");
  const interaction_props = {
    role: on_event_select ? "button" : "img",
    tabIndex: on_event_select && is_current ? 0 : -1,
    onClick: () => on_event_select?.(event.id),
    onKeyDown: (keyboard_event: React.KeyboardEvent<SVGGElement>) => {
      if (
        on_event_select &&
        (keyboard_event.key === "Enter" || keyboard_event.key === " ")
      ) {
        keyboard_event.preventDefault();
        on_event_select(event.id);
      }
    },
  } as const;
  if (event.kind === "rest" || event.notes.length === 0) {
    return (
      <g
        className={class_name}
        data-event-id={event.id}
        data-hand={event.hand}
        data-duration-kind={duration_kind}
        {...marking_data(event)}
        {...interaction_props}
      >
        {is_current && (
          <rect
            className="staff-current-background"
            x={note_x - 12}
            y={top + 4}
            width="24"
            height="34"
            rx="4"
          />
        )}
        <text className="staff-rest" x={note_x} y={top + 25}>
          {rest_glyph(duration_kind)}
        </text>
        <StaffMarkings event={event} x={note_x} top={top} />
      </g>
    );
  }
  const ys = event.notes.map((note) => staff_y(note.midi, top, staff));
  const stem_y = Math.min(...ys);
  return (
    <g
      className={class_name}
      data-event-id={event.id}
      data-hand={event.hand}
      data-staff={staff}
      data-duration-kind={duration_kind}
      {...marking_data(event)}
      {...interaction_props}
    >
      {is_current && (
        <rect
          className="staff-current-background"
          x={note_x - 12}
          y={Math.min(stem_y - 35, top - 12)}
          width="24"
          height={Math.max(64, top + 50 - Math.min(stem_y - 35, top - 12))}
          rx="4"
        />
      )}
      {event.notes.flatMap((note) =>
        ledger_lines(note.midi, top, staff).map((y) => (
          <line
            key={`${note.midi}-${y}`}
            className="staff-ledger-line"
            x1={note_x - 7}
            y1={y}
            x2={note_x + 7}
            y2={y}
          />
        )))}
      {duration_kind !== "whole" && (
        <line
          className="staff-stem"
          x1={note_x + 4}
          y1={stem_y}
          x2={note_x + 4}
          y2={stem_y - 31}
        />
      )}
      {(duration_kind === "eighth" || duration_kind === "sixteenth") && (
        <g className="staff-flags" aria-hidden="true">
          <path d={`M ${note_x + 4} ${stem_y - 31} q 13 5 8 17`} />
          {duration_kind === "sixteenth" && (
            <path d={`M ${note_x + 4} ${stem_y - 23} q 13 5 8 17`} />
          )}
        </g>
      )}
      {event.notes.map((note, index) => (
        <g key={`${event.id}-${note.midi}-${index}`}>
          {show_fingerings && note.finger && (
            <text
              className="staff-fingering"
              x={note_x + index * 10}
              y={staff === "treble" ? ys[index] - 13 : ys[index] + 19}
              data-annotation-source={note.fingering_source}
              data-annotation-status={note.fingering_status}
            >
              {note.fingering_reason && <title>{note.fingering_reason}</title>}
              {note.finger}
            </text>
          )}
          <ellipse
            className={`staff-notehead ${
              duration_kind === "whole" || duration_kind === "half"
                ? "is-open"
                : ""
            }`.trim()}
            cx={note_x}
            cy={ys[index]}
            data-midi={note.midi}
            data-staff={staff}
            rx="5.2"
            ry="3.7"
            transform={`rotate(-20 ${note_x} ${ys[index]})`}
          />
        </g>
      ))}
      <StaffMarkings event={event} x={note_x} top={top} />
    </g>
  );
}

function StaffMarkings({
  event,
  x,
  top,
}: {
  event: jianpu_render_hand_event;
  x: number;
  top: number;
}) {
  const markings = event.markings;
  if (!markings) {
    return null;
  }
  return (
    <g className="staff-event-markings">
      {markings.slur && markings.slur !== "none" && (
        <title>{`Slur ${markings.slur}`}</title>
      )}
      {markings.articulation && (
        <text className="staff-articulation" x={x} y={top - 7}>
          {format_articulation(markings.articulation)}
        </text>
      )}
      {markings.dynamics && (
        <text className="staff-dynamics" x={x} y={top + 56}>
          {markings.dynamics}
        </text>
      )}
    </g>
  );
}

function marking_data(event: jianpu_render_hand_event) {
  return {
    "data-dynamics": event.markings?.dynamics || undefined,
    "data-articulation": event.markings?.articulation || undefined,
    "data-slur": event.markings?.slur && event.markings.slur !== "none"
      ? event.markings.slur
      : undefined,
  };
}

function format_articulation(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "staccato") return "·";
  if (normalized === "accent") return ">";
  if (normalized === "tenuto") return "–";
  return value;
}

type staff_duration_kind =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth";

function get_staff_duration_kind(
  duration_beats: number,
  beat_unit: number,
): staff_duration_kind {
  const quarter_units = duration_beats * 4 / beat_unit;
  if (quarter_units >= 4) return "whole";
  if (quarter_units >= 2) return "half";
  if (quarter_units >= 1) return "quarter";
  if (quarter_units >= 0.5) return "eighth";
  return "sixteenth";
}

function rest_glyph(kind: staff_duration_kind): string {
  return {
    whole: "𝄻",
    half: "𝄼",
    quarter: "𝄽",
    eighth: "𝄾",
    sixteenth: "𝄿",
  }[kind];
}

function score_has_staff(
  score: jianpu_render_score,
  staff: "treble" | "bass",
): boolean {
  return score.measures.some((measure) =>
    [...measure.right, ...measure.left].some((event) =>
      display_staff_for_event(event) === staff));
}

function display_staff_for_event(
  event: jianpu_render_hand_event,
): "treble" | "bass" {
  if (event.markings?.clef === "treble" || event.markings?.clef === "bass") {
    return event.markings.clef;
  }
  if (event.notes.length === 0) {
    return event.hand === "left" ? "bass" : "treble";
  }
  const average_diatonic_index = event.notes.reduce(
    (sum, note) => sum + diatonic_index(note.midi),
    0,
  ) / event.notes.length;
  return average_diatonic_index >= diatonic_index(60) ? "treble" : "bass";
}

function StaffLines({ top, width }: { top: number; width: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <line
          key={index}
          className="staff-line"
          x1={left_margin}
          y1={top + index * 10}
          x2={left_margin + width}
          y2={top + index * 10}
        />
      ))}
    </>
  );
}

function timeline_x(
  x: number,
  width: number,
  beats: number,
  onset: number,
): number {
  return x + 20 + Math.max(0, Math.min(beats, onset)) / beats * (width - 32);
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

function staff_y(midi: number, top: number, staff: "treble" | "bass"): number {
  const baseline = staff === "treble" ? diatonic_index(64) : diatonic_index(40);
  return top + 40 - (diatonic_index(midi) - baseline) * 5;
}

function ledger_lines(
  midi: number,
  top: number,
  staff: "treble" | "bass",
): number[] {
  const y = staff_y(midi, top, staff);
  const staff_bottom = top + 40;
  const lines: number[] = [];
  if (y < top) {
    for (let line = top - 10; line >= y; line -= 10) {
      lines.push(line);
    }
  } else if (y > staff_bottom) {
    for (let line = staff_bottom + 10; line <= y; line += 10) {
      lines.push(line);
    }
  }
  return lines;
}

function diatonic_index(midi: number): number {
  const pitch_class_to_step = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return Math.floor(midi / 12) * 7 + pitch_class_to_step[midi % 12];
}

function chunk_measures(
  measures: jianpu_render_measure[],
): jianpu_render_measure[][] {
  const systems: jianpu_render_measure[][] = [];
  for (let index = 0; index < measures.length; index += measures_per_system) {
    systems.push(measures.slice(index, index + measures_per_system));
  }
  return systems;
}
