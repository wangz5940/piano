import type { calibration_project } from "../../src/features/calibration/types.ts";
import type { score_document, score_finger, score_hand } from "../../src/features/score/types.ts";

const white_midis = Array.from({ length: 88 }, (_, index) => index + 21)
  .filter((midi) => [0, 2, 4, 5, 7, 9, 11].includes(midi % 12));
type Template = { hand: score_hand; midis: number[]; sources: Set<string> };

/** Learn only internally consistent five-finger white-key positions from
 * reference phrases, never a global pitch -> finger majority vote. */
export function apply_reference_fingerings(
  project: calibration_project,
  references: Array<{ id: string; document: score_document }>,
): number {
  const templates = new Map<string, Template>();
  for (const reference of references) {
    for (const measure of reference.document.measures) {
      for (const hand of ["left", "right"] as const) {
        const notes = measure.events.filter((event) => event.hand === hand)
          .flatMap((event) => event.notes).filter((note) => note.finger);
        if (new Set(notes.map((note) => note.midi)).size < 3) continue;
        const starts = notes.map((note) =>
          white_midis.indexOf(note.midi) - (hand === "right" ? note.finger! - 1 : 5 - note.finger!));
        if (starts.some((start) => start < 0 || start !== starts[0])) continue;
        const midis = white_midis.slice(starts[0], starts[0] + 5);
        if (midis.length !== 5) continue;
        const key = `${hand}:${midis.join(",")}`;
        const template = templates.get(key) ?? { hand, midis, sources: new Set<string>() };
        template.sources.add(reference.id);
        templates.set(key, template);
      }
    }
  }
  let generated = 0;
  const positions: Partial<Record<score_hand, string>> = {};
  const initial_positions: Partial<Record<score_hand, string>> = {};
  // A source system is a musical phrase boundary, unlike a pitch-only rule.
  const systems = new Map<string, typeof project.document.measures>();
  for (const measure of project.document.measures) {
    const meta = project.event_metadata[measure.events[0]?.id];
    const key = `${meta?.source_page}:${meta?.source_system}:${measure.key_signature}`;
    const group = systems.get(key) ?? [];
    group.push(measure);
    systems.set(key, group);
  }
  for (const measures of systems.values()) {
    for (const hand of ["left", "right"] as const) {
      const events = measures.flatMap((measure) => measure.events.filter((event) => event.hand === hand));
      const notes = events.flatMap((event) => event.notes);
      const pitches = [...new Set(notes.map((note) => note.midi))];
      if (pitches.length < 3 || pitches.length > 5) continue;
      const candidates = [...templates.values()].filter((template) =>
        template.hand === hand &&
        pitches.every((midi) => template.midis.includes(midi)) &&
        notes.every((note) => !note.finger || note.finger ===
          (hand === "right" ? template.midis.indexOf(note.midi) + 1 : 5 - template.midis.indexOf(note.midi))));
      if (candidates.length !== 1) continue;
      const template = candidates[0];
      const position = template.midis.join(",");
      const reason = `参照 ${[...template.sources].join("、")} 的固定五指手位；本乐句音域 ${Math.min(...pitches)}–${Math.max(...pitches)} 全部落在同一手位，按相邻白键对应相邻手指生成。尚未逐音人工确认。`;
      const annotation = {
        source: "generated" as const,
        status: "needs_review" as const,
        reason,
        confirmed_by: null,
        confirmed_at: null,
        source_refs: [],
      };
      for (const note of notes) {
        if (note.finger) continue;
        note.finger = (hand === "right"
          ? template.midis.indexOf(note.midi) + 1
          : 5 - template.midis.indexOf(note.midi)) as score_finger;
        note.fingering = { ...annotation };
        generated += 1;
      }
      project.document.hand_positions.push({
        id: `${project.id}-position-${project.document.hand_positions.length + 1}`,
        hand,
        range: {
          start: { measure_id: measures[0].id, beat: 0 },
          end: { measure_id: measures.at(-1)!.id, beat: measures.at(-1)!.meter.beats },
        },
        position_name: `${hand === "left" ? "左手" : "右手"}固定五指手位`,
        covered_midis: template.midis,
        finger_map: template.midis.map((midi, index) => ({
          midi, finger: (hand === "right" ? index + 1 : 5 - index) as score_finger,
        })),
        movement: !positions[hand] || positions[hand] === position
          ? "stay" : initial_positions[hand] === position ? "return" : "move",
        annotation,
      });
      initial_positions[hand] ??= position;
      positions[hand] = position;
    }
  }
  return generated;
}
