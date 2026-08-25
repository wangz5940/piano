import type { score_document, score_document_event } from "@/features/score";

export interface score_document_musicxml_event_metadata {
  staff?: number;
  clef?: "treble" | "bass" | "alto" | "tenor" | "percussion" | "unknown";
  dynamics?: string;
  articulation?: string;
  slur?: "none" | "start" | "continue" | "stop";
}

export function score_document_to_musicxml(
  document: score_document,
  event_metadata: Readonly<Record<string, score_document_musicxml_event_metadata>> = {},
): string {
  const time = parse_time_signature(document.time_signature);
  const divisions = 16;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="4.0">',
    "  <identification>",
    "    <encoding>",
    "      <software>Panio calibration</software>",
    `      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>`,
    "    </encoding>",
    "  </identification>",
    "  <part-list>",
    '    <score-part id="P1">',
    "      <part-name>Piano</part-name>",
    "    </score-part>",
    "  </part-list>",
    '  <part id="P1">',
  ];
  for (const [measure_index, measure] of document.measures.entries()) {
    lines.push(`    <measure number="${xml_escape(measure.number || String(measure_index + 1))}">`);
    const measure_time = parse_measure_meter(measure.meter, time);
    if (measure_index === 0) {
      lines.push("      <attributes>");
      lines.push(`        <divisions>${divisions}</divisions>`);
      lines.push("        <key>");
      lines.push(`          <fifths>${key_signature_to_fifths(document.key_signature, document.tonic_midi)}</fifths>`);
      lines.push("        </key>");
      lines.push("        <time>");
      lines.push(`          <beats>${measure_time.beats}</beats>`);
      lines.push(`          <beat-type>${measure_time.beat_unit}</beat-type>`);
      lines.push("        </time>");
      lines.push("        <staves>2</staves>");
      for (const staff_number of [1, 2]) {
        const clef = musicxml_clef_for_staff();
        lines.push(`        <clef number="${staff_number}">`);
        lines.push(`          <sign>${clef.sign}</sign>`);
        lines.push(`          <line>${clef.line}</line>`);
        lines.push("        </clef>");
      }
      lines.push("      </attributes>");
    }

    const events_by_staff = new Map<number, score_document_event[]>();
    for (const event of measure.events) {
      const staff = musicxml_staff_for_event(event);
      const list = events_by_staff.get(staff) ?? [];
      list.push(event);
      events_by_staff.set(staff, list);
    }
    const sorted_staffs = [...events_by_staff.keys()].sort((a, b) => a - b);
    for (const [staff_index, staff] of sorted_staffs.entries()) {
      if (staff_index > 0) {
        lines.push("      <backup>");
        lines.push(`        <duration>${Math.round(measure_time.beats * divisions)}</duration>`);
        lines.push("      </backup>");
      }
      for (const event of (events_by_staff.get(staff) ?? []).sort((a, b) =>
        a.onset_beats - b.onset_beats || a.duration_beats - b.duration_beats)) {
        lines.push(...score_event_to_musicxml_notes(
          event,
          staff,
          divisions,
          event_metadata[event.id],
        ));
      }
    }
    lines.push("    </measure>");
  }
  lines.push("  </part>");
  lines.push("</score-partwise>");
  return `${lines.join("\n")}\n`;
}

function score_event_to_musicxml_notes(
  event: score_document_event,
  staff: number,
  divisions: number,
  metadata?: score_document_musicxml_event_metadata,
): string[] {
  const duration = Math.max(1, Math.round(Number(event.duration_beats) * divisions));
  const notes = event.notes.length > 0 ? event.notes : [undefined];
  return notes.flatMap((note, note_index) => {
    const lines = [
      ...musicxml_dynamics_direction(event, metadata, note_index),
      "      <note>",
    ];
    if (note_index > 0) {
      lines.push("        <chord/>");
    }
    if (!note) {
      lines.push("        <rest/>");
    } else {
      const pitch = midi_to_musicxml_pitch(note.midi);
      lines.push("        <pitch>");
      lines.push(`          <step>${pitch.step}</step>`);
      if (pitch.alter !== 0) {
        lines.push(`          <alter>${pitch.alter}</alter>`);
      }
      lines.push(`          <octave>${pitch.octave}</octave>`);
      lines.push("        </pitch>");
    }
    for (const tie_type of note ? musicxml_tie_types(event.tie) : []) {
      lines.push(`        <tie type="${tie_type}"/>`);
    }
    lines.push(`        <duration>${duration}</duration>`);
    lines.push(`        <voice>${event.voice ?? staff}</voice>`);
    lines.push(`        <type>${duration_to_musicxml_type(event.duration_beats)}</type>`);
    lines.push(`        <staff>${staff}</staff>`);
    lines.push(...musicxml_notations(event, note, note_index, metadata));
    lines.push("      </note>");
    return lines;
  });
}

function musicxml_dynamics_direction(
  event: score_document_event,
  metadata: score_document_musicxml_event_metadata | undefined,
  note_index: number,
): string[] {
  const dynamics = metadata?.dynamics?.trim();
  if (!dynamics || note_index > 0) {
    return [];
  }
  return [
    "      <direction placement=\"below\">",
    "        <direction-type>",
    "          <dynamics>",
    `            <${xml_name(dynamics)}/>`,
    "          </dynamics>",
    "        </direction-type>",
    `        <staff>${musicxml_staff_for_event(event)}</staff>`,
    "      </direction>",
  ];
}

function musicxml_notations(
  event: score_document_event,
  note: score_document_event["notes"][number] | undefined,
  note_index: number,
  metadata?: score_document_musicxml_event_metadata,
): string[] {
  const slur = note_index === 0 && metadata?.slur && metadata.slur !== "none"
    ? metadata.slur
    : undefined;
  const articulation = note_index === 0 ? normalize_articulation(metadata?.articulation) : undefined;
  const tie_types = note ? musicxml_tie_types(event.tie) : [];
  if (!note?.finger && !slur && !articulation && tie_types.length === 0) {
    return [];
  }
  const lines = ["        <notations>"];
  for (const tie_type of tie_types) {
    lines.push(`          <tied type="${tie_type}"/>`);
  }
  if (note?.finger) {
    lines.push("          <technical>");
    lines.push(`            <fingering>${note.finger}</fingering>`);
    lines.push("          </technical>");
  }
  if (articulation) {
    lines.push("          <articulations>");
    lines.push(`            <${articulation}/>`);
    lines.push("          </articulations>");
  }
  if (slur) {
    lines.push(`          <slur type="${slur}"/>`);
  }
  lines.push("        </notations>");
  return lines;
}

function musicxml_tie_types(
  tie: score_document_event["tie"],
): Array<"start" | "stop"> {
  if (tie === "start") {
    return ["start"];
  }
  if (tie === "stop") {
    return ["stop"];
  }
  if (tie === "continue") {
    return ["stop", "start"];
  }
  return [];
}

function parse_time_signature(value: string) {
  const match = /^(\d+)\s*\/\s*(\d+)/.exec(value);
  return {
    beats: match ? Number(match[1]) : 4,
    beat_unit: match ? Number(match[2]) : 4,
  };
}

function parse_measure_meter(
  meter: { beats: number; beat_unit: number } | undefined,
  fallback: { beats: number; beat_unit: number },
) {
  return {
    beats: Number.isFinite(meter?.beats) ? Number(meter?.beats) : fallback.beats,
    beat_unit: Number.isFinite(meter?.beat_unit) ? Number(meter?.beat_unit) : fallback.beat_unit,
  };
}

function musicxml_staff_for_event(
  event: score_document_event,
): number {
  return event.hand === "left" ? 2 : 1;
}

function musicxml_clef_for_staff() {
  return { sign: "G", line: 2 };
}

function midi_to_musicxml_pitch(midi: number) {
  const pitch_classes = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const normalized_midi = Number(midi);
  const pitch = pitch_classes[((normalized_midi % 12) + 12) % 12];
  return {
    ...pitch,
    octave: Math.floor(normalized_midi / 12) - 1,
  };
}

function duration_to_musicxml_type(duration_beats: number) {
  if (duration_beats >= 4) return "whole";
  if (duration_beats >= 2) return "half";
  if (duration_beats >= 1) return "quarter";
  if (duration_beats >= 0.5) return "eighth";
  return "16th";
}

function key_signature_to_fifths(key_signature: string, tonic_midi: number): number {
  const normalized = key_signature.toLowerCase();
  if (normalized.includes("f#") || normalized.includes("f♯")) return 6;
  if (normalized.includes("c#") || normalized.includes("c♯")) return 7;
  if (normalized.includes("bb") || normalized.includes("b♭")) return -2;
  if (normalized.includes("eb") || normalized.includes("e♭")) return -3;
  if (normalized.includes("ab") || normalized.includes("a♭")) return -4;
  if (normalized.includes("db") || normalized.includes("d♭")) return -5;
  if (normalized.includes("gb") || normalized.includes("g♭")) return -6;
  if (normalized.includes("cb") || normalized.includes("c♭")) return -7;
  if (normalized.includes("g")) return 1;
  if (normalized.includes("d")) return 2;
  if (normalized.includes("a")) return 3;
  if (normalized.includes("e")) return 4;
  if (normalized.includes("b")) return 5;
  if (normalized.includes("f")) return -1;
  const major_fifths_by_tonic = new Map([
    [0, 0],
    [7, 1],
    [2, 2],
    [9, 3],
    [4, 4],
    [11, 5],
    [6, 6],
    [1, 7],
    [5, -1],
    [10, -2],
    [3, -3],
    [8, -4],
  ]);
  return major_fifths_by_tonic.get(((tonic_midi % 12) + 12) % 12) ?? 0;
}

function normalize_articulation(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["staccato", "accent", "tenuto", "strong-accent", "detached-legato"].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

function xml_name(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return normalized || "mf";
}

function xml_escape(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
