import type { material_practice_event, note_fingering } from "./types";

export function inject_musicxml_fingerings(
  musicxml: string,
  events: material_practice_event[],
): string {
  if (events.length === 0 || typeof DOMParser === "undefined") {
    return musicxml;
  }

  const document = new DOMParser().parseFromString(musicxml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    return musicxml;
  }

  const queues = build_measure_fingering_queues(events);
  const measures = Array.from(document.getElementsByTagName("measure"));
  measures.forEach((measure, index) => {
    const measure_number = measure.getAttribute("number") ?? String(index + 1);
    const queue = queues.by_number.get(measure_number) ?? queues.by_index.get(index + 1);
    if (!queue || queue.length === 0) {
      return;
    }

    const notes = Array.from(measure.getElementsByTagName("note"));
    notes.forEach((note) => {
      const midi = get_note_midi(note);
      if (midi === undefined) {
        return;
      }

      const fingering_index = queue.findIndex((fingering) => fingering.note === midi);
      if (fingering_index < 0) {
        return;
      }

      const [fingering] = queue.splice(fingering_index, 1);
      add_note_fingering(document, note, fingering);
    });
  });

  return new XMLSerializer().serializeToString(document);
}

function build_measure_fingering_queues(events: material_practice_event[]): {
  by_number: Map<string, note_fingering[]>;
  by_index: Map<number, note_fingering[]>;
} {
  const by_number = new Map<string, note_fingering[]>();
  const by_index = new Map<number, note_fingering[]>();
  const ordered_events = [...events].sort((left, right) =>
    left.measure_index - right.measure_index ||
    left.onset_beats - right.onset_beats ||
    left.id.localeCompare(right.id));

  ordered_events.forEach((event) => {
    const number_queue = by_number.get(event.measure_number) ?? [];
    number_queue.push(...event.fingerings);
    by_number.set(event.measure_number, number_queue);

    const index_queue = by_index.get(event.measure_index) ?? [];
    index_queue.push(...event.fingerings);
    by_index.set(event.measure_index, index_queue);
  });

  return { by_number, by_index };
}

function get_note_midi(note: Element): number | undefined {
  if (note.getElementsByTagName("rest").length > 0) {
    return undefined;
  }

  const pitch = note.getElementsByTagName("pitch")[0];
  if (!pitch) {
    return undefined;
  }

  const step = pitch.getElementsByTagName("step")[0]?.textContent ?? "";
  const octave = Number(pitch.getElementsByTagName("octave")[0]?.textContent);
  const alter = Number(pitch.getElementsByTagName("alter")[0]?.textContent ?? 0);
  const semitone = step_to_semitone(step);
  if (semitone === undefined || !Number.isFinite(octave) || !Number.isFinite(alter)) {
    return undefined;
  }

  return (octave + 1) * 12 + semitone + alter;
}

function add_note_fingering(
  document: XMLDocument,
  note: Element,
  fingering: note_fingering,
): void {
  if (note.getElementsByTagName("fingering").length > 0) {
    return;
  }

  const notations = get_or_create_child(document, note, "notations");
  const technical = get_or_create_child(document, notations, "technical");
  const fingering_element = document.createElement("fingering");
  fingering_element.setAttribute("placement", fingering.hand === "left" ? "below" : "above");
  fingering_element.textContent = String(fingering.finger);
  technical.appendChild(fingering_element);
}

function get_or_create_child(
  document: XMLDocument,
  parent: Element,
  tag_name: string,
): Element {
  const existing = Array.from(parent.children).find((child) => child.tagName === tag_name);
  if (existing) {
    return existing;
  }

  const child = document.createElement(tag_name);
  parent.appendChild(child);
  return child;
}

function step_to_semitone(step: string): number | undefined {
  switch (step) {
    case "C":
      return 0;
    case "D":
      return 2;
    case "E":
      return 4;
    case "F":
      return 5;
    case "G":
      return 7;
    case "A":
      return 9;
    case "B":
      return 11;
    default:
      return undefined;
  }
}
