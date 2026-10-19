import type { jianpu_event, jianpu_score, jianpu_material } from "@/features/jianpu/types";
import type { calibration_project } from "./types";

export function personal_material(material: jianpu_material, projects: calibration_project[]): jianpu_material {
  return {
    ...material,
    segments: material.segments.map((segment) => {
      const project = projects.find((item) => item.id === `material:${material.id}:${segment.id}`);
      if (!project) return segment;
      const measure_count = project.document.measures.length;
      const single = (segment.content_sections?.length ?? 0) <= 1 && segment.page_slices.length === 1;
      return {
        ...segment, title: project.title,
        measure_count: single ? measure_count : segment.measure_count,
        content_sections: segment.content_sections?.map((section) => ({
          ...section,
          title: segment.content_sections?.length === 1 ? project.title : section.title,
          measure_end: single ? measure_count : section.measure_end,
        })),
        page_slices: segment.page_slices.map((slice) => ({
          ...slice, title: project.title, measure_end: single ? measure_count : slice.measure_end,
        })),
      };
    }),
  };
}

export function personal_jianpu_score(project: calibration_project, segment_id: string): jianpu_score {
  const document = project.document;
  return {
    schema_version: "1.0", segment_id, key_signature: document.key_signature,
    tonic_midi: document.tonic_midi, time_signature: document.time_signature,
    measures: document.measures.map((measure, index) => {
      const events = new Map<string, jianpu_event>();
      for (const event of measure.events) {
        const key = `${event.onset_beats}|${event.duration_beats}|${event.chord ?? ""}|${event.grace ? event.id : ""}`;
        const group = events.get(key) ?? {
          onset_beats: event.onset_beats, duration_beats: event.duration_beats,
          right_notes: [], left_notes: [], right_fingerings: [], left_fingerings: [],
          ...(event.grace ? { grace: event.grace } : {}), chord: event.chord,
        };
        const hand = event.hand === "left" ? "left" : "right";
        group[`${hand}_notes`].push(...event.notes.map((note) => note.midi));
        if (!event.notes.length) group[`${hand}_rest`] = true;
        for (const note of event.notes) {
          if (note.finger) group[`${hand}_fingerings`]!.push({
            note: note.midi, finger: note.finger, source: "manual",
          });
        }
        group[`${hand}_slur`] ??= project.event_metadata[event.id]?.slur;
        events.set(key, group);
      }
      for (const event of events.values()) {
        if (event.left_notes.length) delete event.left_rest;
        if (event.right_notes.length) delete event.right_rest;
      }
      return {
        index: index + 1, number: measure.number, directions: [], meter: measure.meter,
        key_signature: measure.key_signature ?? document.key_signature,
        tonic_midi: measure.tonic_midi ?? document.tonic_midi,
        events: [...events.values()].sort((a, b) => a.onset_beats - b.onset_beats || a.duration_beats - b.duration_beats),
      };
    }),
  };
}
