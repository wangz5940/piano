import { XMLBuilder, XMLParser } from "fast-xml-parser";

type Node = Record<string, unknown>;
export interface SourceCorrection {
  evidence: string;
  source_pages: number[];
  hand?: "left" | "right";
  eighth_triplets?: boolean;
  retime_notation?: boolean;
  remove_tuplets?: boolean;
  replace_first_measure?: Array<Array<{ midi: number; quarters: number }>>;
  initial_meter?: { beats: number; beat_unit: number };
  rebuild_measure?: Array<{
    part: string;
    number: string;
    staves: Array<{ staff: number; voice: number; midis: number[]; type: string }>;
  }>;
}
const children = (node: Node, name: string) => (node[name] ?? []) as Node[];
const has = (node: Node, name: string) => Array.isArray(node[name]);
const text = (nodes: Node[], name: string) =>
  String(children(nodes.find((node) => has(node, name)) ?? {}, name)[0]?.["#text"] ?? "");
const attribute = (node: Node, name: string) =>
  String((node[":@"] as Node | undefined)?.[`@_${name}`] ?? "");
const set_text = (nodes: Node[], name: string, value: number | string) => {
  const node = nodes.find((node) => has(node, name));
  if (node) node[name] = [{ "#text": value }];
  else nodes.push({ [name]: [{ "#text": value }] });
};
const types: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125 };

/** Corrections here require a score-specific, cited source rule. Ordinary
 * import never guesses tuplets, missing bars, or a different time signature. */
export function apply_source_correction(xml: string, rule?: SourceCorrection): string {
  if (!rule) return xml;
  const options = { ignoreAttributes: false, preserveOrder: true, trimValues: true };
  const parsed = new XMLParser(options).parse(xml) as Node[];
  const root = children(parsed.find((node) => has(node, "score-partwise"))!, "score-partwise");
  const parts = root.filter((node) => has(node, "part"));
  if (rule.hand) {
    for (const part of children(root.find((node) => has(node, "part-list"))!, "part-list")) {
      if (!has(part, "score-part")) continue;
      const name = children(part, "score-part").find((node) => has(node, "part-name"));
      if (name) name["part-name"] = [{ "#text": rule.hand === "left" ? "Left hand" : "Right hand" }];
    }
  }
  for (const part of parts) {
    const measures = children(part, "part").filter((node) => has(node, "measure"));
    let divisions = 1;
    for (const [index, measure] of measures.entries()) {
      const nodes = children(measure, "measure");
      const first_timed = nodes.findIndex((node) =>
        has(node, "note") || has(node, "backup") || has(node, "forward"));
      let attrs = nodes.slice(0, first_timed < 0 ? nodes.length : first_timed)
        .find((node) => has(node, "attributes"));
      if (!attrs) {
        attrs = { attributes: [] };
        nodes.unshift(attrs);
      }
      const attr_nodes = children(attrs, "attributes");
      divisions = Number(text(attr_nodes, "divisions")) || divisions;
      const rebuild = rule.rebuild_measure?.find((item) =>
        item.part === attribute(part, "id") && item.number === attribute(measure, "number"));
      if (rebuild) {
        const original_notes = nodes.filter((node) => has(node, "note"));
        const music: Node[] = [];
        let used = 0;
        for (const [staff_index, spec] of rebuild.staves.entries()) {
          const notes = original_notes.filter((node) =>
            Number(text(children(node, "note"), "staff") || 1) === spec.staff);
          const midis = notes.map((node) => {
            const pitch = children(children(node, "note").find((item) => has(item, "pitch")) ?? {}, "pitch");
            return (Number(text(pitch, "octave")) + 1) * 12 +
              ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[text(pitch, "step")] ?? NaN) +
              Number(text(pitch, "alter") || 0);
          });
          if (JSON.stringify(midis) !== JSON.stringify(spec.midis) || !types[spec.type]) {
            throw new Error(`Source correction pitch mismatch: ${rebuild.part}/${rebuild.number}/${spec.staff}`);
          }
          used += notes.length;
          for (const node of notes) {
            const note = children(node, "note");
            set_text(note, "voice", spec.voice);
            set_text(note, "type", spec.type);
            set_text(note, "duration", types[spec.type] * divisions);
            node.note = note.filter((item) => !has(item, "time-modification") && !has(item, "chord"));
          }
          music.push(...notes);
          if (staff_index < rebuild.staves.length - 1) {
            music.push({ backup: [{ duration: [{ "#text": notes.length * types[spec.type] * divisions }] }] });
          }
        }
        if (used !== original_notes.length) throw new Error("Source correction would omit notes");
        const first_note = nodes.findIndex((node) => has(node, "note"));
        const prefix = nodes.slice(0, first_note);
        const suffix = nodes.slice(first_note).filter((node) =>
          !has(node, "note") && !has(node, "backup") && !has(node, "forward"));
        nodes.splice(0, nodes.length, ...prefix, ...music, ...suffix);
      }
      if (rule.initial_meter && attribute(measure, "number") === "1") {
        const time = { time: [
          { beats: [{ "#text": rule.initial_meter.beats }] },
          { "beat-type": [{ "#text": rule.initial_meter.beat_unit }] },
        ] };
        const current = attr_nodes.findIndex((node) => has(node, "time"));
        if (current >= 0) attr_nodes[current] = time;
        else attr_nodes.push(time);
      }
      if (!rule.retime_notation && !rule.eighth_triplets) continue;
      let source_cursor = 0;
      let target_cursor = 0;
      for (const node of nodes) {
        if (has(node, "note")) {
          const note = children(node, "note");
          const old_duration = Number(text(note, "duration")) / divisions;
          const type = text(note, "type");
          if (rule.remove_tuplets) {
            node.note = note.filter((item) => !has(item, "time-modification"));
            for (const notation of children(node, "note").filter((item) => has(item, "notations"))) {
              notation.notations = children(notation, "notations").filter((item) => !has(item, "tuplet"));
            }
          }
          const edited_note = children(node, "note");
          let duration = rule.retime_notation && types[type]
            ? types[type] * (2 - 2 ** -note.filter((item) => has(item, "dot")).length)
            : old_duration;
          if (rule.eighth_triplets && type === "eighth") {
            duration = 1 / 3;
            const modification = {
              "time-modification": [
                { "actual-notes": [{ "#text": 3 }] },
                { "normal-notes": [{ "#text": 2 }] },
                { "normal-type": [{ "#text": "eighth" }] },
              ],
            };
            const existing = edited_note.findIndex((item) => has(item, "time-modification"));
            if (existing >= 0) edited_note[existing] = modification;
            else edited_note.splice(edited_note.findIndex((item) => has(item, "type")) + 1, 0, modification);
          }
          set_text(edited_note, "duration", Math.round(duration * 960));
          if (!note.some((item) => has(item, "chord"))) {
            source_cursor += old_duration;
            target_cursor += duration;
          }
        } else if (has(node, "backup")) {
          const backup = children(node, "backup");
          const duration = Number(text(backup, "duration")) / divisions;
          if (Math.abs(duration - source_cursor) > 0.001) {
            throw new Error(`Cannot safely retime partial backup in part ${attribute(part, "id")}, measure ${index + 1}`);
          }
          set_text(backup, "duration", Math.round(target_cursor * 960));
          source_cursor = 0;
          target_cursor = 0;
        } else if (has(node, "forward")) {
          const forward = children(node, "forward");
          const duration = Number(text(forward, "duration")) / divisions;
          set_text(forward, "duration", Math.round(duration * 960));
          source_cursor += duration;
          target_cursor += duration;
        }
      }
      set_text(attr_nodes, "divisions", 960);
    }
    if (rule.replace_first_measure) {
      const first = measures[0];
      const first_nodes = children(first, "measure");
      if (parts.length !== 1) throw new Error("Measure replacement requires a single part");
      const replacement = rule.replace_first_measure.map((notes, index) => ({
        measure: [
          ...(index === 0 ? first_nodes.filter((node) =>
            !has(node, "note") && !has(node, "backup") && !has(node, "forward")) : []),
          ...notes.map(({ midi, quarters }) => {
            const step = ["C", "", "D", "", "E", "F", "", "G", "", "A", "", "B"][midi % 12];
            if (!step || ![1, 2, 4].includes(quarters)) throw new Error("Unsupported source replacement note");
            return { note: [
              { pitch: [{ step: [{ "#text": step }] }, { octave: [{ "#text": Math.floor(midi / 12) - 1 }] }] },
              { duration: [{ "#text": quarters * 960 }] },
              { voice: [{ "#text": 1 }] },
              { type: [{ "#text": quarters === 4 ? "whole" : quarters === 2 ? "half" : "quarter" }] },
            ] };
          }),
        ],
        ":@": { "@_number": String(index + 1) },
      }));
      const part_nodes = children(part, "part");
      part_nodes.splice(part_nodes.indexOf(first), 1, ...replacement);
      part_nodes.filter((node) => has(node, "measure")).forEach((node, index) => {
        node[":@"] = { ...(node[":@"] as Node), "@_number": String(index + 1) };
      });
    }
  }
  return new XMLBuilder({ ...options, format: true }).build(parsed);
}
