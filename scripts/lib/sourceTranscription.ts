import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface SourceTranscription {
  title?: string;
  evidence: string;
  reviewed_pages: number[];
  excluded_regions: Array<{ page: number; reason: string }>;
  sections: Array<{
    page: number;
    title: string;
    meter: [number, number];
    unmetered?: boolean;
    fifths?: number;
    continues?: boolean;
    left_clef?: "treble" | "bass";
    right_clef?: "treble" | "bass";
    lines: Array<Array<{
      right?: string;
      left?: string;
      voices?: Array<{ staff: 1 | 2; voice: number; notes: string }>;
      quarters?: number;
      repeat_start?: boolean;
      repeat_end?: boolean;
      ending_start?: string;
      ending_stop?: string;
      left_clef?: "treble" | "bass";
      right_clef?: "treble" | "bass";
    }>>;
  }>;
}

/** Long segments can keep independently reviewed pages in separate files. */
export function read_source_transcription(path: string): SourceTranscription {
  const source = JSON.parse(readFileSync(path, "utf8"));
  if (!source.files) return source;
  const fragments: SourceTranscription[] = source.files.map((file: string) => {
    if (file.includes("..") || file.startsWith("/")) throw new Error("Invalid transcription fragment path");
    return read_source_transcription(resolve(dirname(path), file));
  });
  return {
    title: source.title,
    evidence: fragments.map((fragment) => fragment.evidence).join(" "),
    reviewed_pages: [...new Set(fragments.flatMap((fragment) => fragment.reviewed_pages))],
    excluded_regions: fragments.flatMap((fragment) => fragment.excluded_regions),
    sections: fragments.flatMap((fragment) => fragment.sections),
  };
}

/** Explicit PDF transcription, never inferred from the old OMR pitches.
 * Tokens: C4/1/3 = quarter C4, printed finger 3; r/2 = half rest;
 * s/2 = unprinted empty beats; G3+A3/1/4,3 = chord with source fingers.
 * C4/0.5t = eighth-note triplet (one third of a quarter).
 * C#5/0.5g = slashed eighth grace note (zero metrical duration).
 * @bass / @treble change the current staff clef at the current beat.
 * Each line is a source system, each object is a source measure.
 */
export function render_source_transcription(xml: string, source: SourceTranscription): string {
  const parser = new XMLParser({ ignoreAttributes: false });
  const original = parser.parse(xml);
  const score = original["score-partwise"];
  const pages = [...new Set(source.sections.map((section) => section.page))];
  if (!pages.length || pages.some((page) => !source.reviewed_pages.includes(page))) {
    throw new Error("Transcription requires reviewed source pages");
  }
  const miscellaneous = score.identification?.miscellaneous;
  if (miscellaneous) {
    const fields = miscellaneous["miscellaneous-field"];
    miscellaneous["miscellaneous-field"] = [
      ...(Array.isArray(fields) ? fields : fields ? [fields] : [])
        .filter((field) => !String(field["@_name"]).startsWith("source-sheet-")),
      ...pages.map((page) => ({
        "@_name": `source-sheet-${page}`,
        "#text": source.sections.filter((section) => section.page === page)
          .flatMap((section) => section.lines).map((_, index) => index + 1).join(" "),
      })),
    ];
  }
  const measures: Record<string, unknown>[] = [];
  let previous_page: number | undefined;
  for (const section of source.sections) {
    const full_length = section.meter[0] * 4 / section.meter[1];
    for (const [line_index, line] of section.lines.entries()) {
      for (const [bar_index, bar] of line.entries()) {
        // A printed pickup or complementary final bar keeps its actual length
        // without changing the surrounding time signature.
        const length = bar.quarters ?? full_length;
        const first = line_index === 0 && bar_index === 0;
        const nodes: Record<string, unknown>[] = [];
        if (bar_index === 0) {
          nodes.push({ print: "", ":@": {
            ...(measures.length ? { [section.page !== previous_page ? "@_new-page" : "@_new-system"]: "yes" } : {}),
          } });
        }
        if (first) {
          nodes.push({ attributes: [
            { divisions: [{ "#text": 960 }] },
            { key: [{ fifths: [{ "#text": section.fifths ?? 0 }] }] },
            { time: section.unmetered ? [{ "senza-misura": [] }] :
              [{ beats: [{ "#text": section.meter[0] }] }, { "beat-type": [{ "#text": section.meter[1] }] }] },
            { staves: [{ "#text": 2 }] },
            { clef: [
              { sign: [{ "#text": section.right_clef === "bass" ? "F" : "G" }] },
              { line: [{ "#text": section.right_clef === "bass" ? 4 : 2 }] },
            ], ":@": { "@_number": 1 } },
            { clef: [
              { sign: [{ "#text": section.left_clef === "treble" ? "G" : "F" }] },
              { line: [{ "#text": section.left_clef === "treble" ? 2 : 4 }] },
            ], ":@": { "@_number": 2 } },
          ] });
          nodes.push({ direction: [{ "direction-type": [{ words: [{ "#text": section.title }] }] }] });
        }
        if (bar.left_clef || bar.right_clef) nodes.push({ attributes:
          ([[1, bar.right_clef], [2, bar.left_clef]] as const)
            .filter(([, clef]) => clef)
            .map(([staff, clef]) => ({ clef: [
              { sign: [{ "#text": clef === "bass" ? "F" : "G" }] },
              { line: [{ "#text": clef === "bass" ? 4 : 2 }] },
            ], ":@": { "@_number": staff } })),
        });
        if (bar.repeat_start || bar.ending_start) nodes.push({
          barline: [
            ...(bar.ending_start ? [{ ending: [], ":@": { "@_number": bar.ending_start, "@_type": "start" } }] : []),
            ...(bar.repeat_start ? [{ repeat: [], ":@": { "@_direction": "forward" } }] : []),
          ], ":@": { "@_location": "left" },
        });
        let hands = 0;
        const voices = [
          { staff: 1, voice: 1, notes: bar.right },
          { staff: 2, voice: 5, notes: bar.left },
          ...(bar.voices ?? []),
        ];
        for (const { staff, voice, notes: text } of voices) {
          if (!text) continue;
          if (hands++) nodes.push({ backup: [{ duration: [{ "#text": length * 960 }] }] });
          let total = 0;
          for (const token of text.trim().split(/\s+/u)) {
            if (token === "@bass" || token === "@treble") {
              nodes.push({ attributes: [{ clef: [
                { sign: [{ "#text": token === "@bass" ? "F" : "G" }] },
                { line: [{ "#text": token === "@bass" ? 4 : 2 }] },
              ], ":@": { "@_number": staff } }] });
              continue;
            }
            const match = /^(r|R|s|[A-G][#bn]?-?\d(?:\+[A-G][#bn]?-?\d)*)\/([\d.]+[tg]?)(?:\/([1-5](?:,[1-5])*))?(?:~(start|stop|continue))?(?:!(staccato|staccatissimo|tenuto|detached-legato|accent|strong-accent|fermata))?(?:\^(start|stop|continue))?$/u.exec(token);
            if (!match) throw new Error(`Invalid transcription token: ${token}`);
            const [, pitch, value, finger, tie, articulation, slur] = match;
            const triplet = value.endsWith("t");
            const grace = value.endsWith("g");
            if (grace && ["r", "R", "s"].includes(pitch)) throw new Error("Grace notes must have pitches");
            const written_value = triplet || grace ? value.slice(0, -1) : value;
            const duration = grace ? 0 : Number(written_value) * (triplet ? 2 / 3 : 1);
            if (pitch === "s") {
              nodes.push({ forward: [
                { duration: [{ "#text": duration * 960 }] },
                { voice: [{ "#text": voice }] },
                { staff: [{ "#text": staff }] },
              ] });
              total += duration;
              continue;
            }
            const notation: Record<string, [string, number]> = {
              "4": ["whole", 0], "3": ["half", 1], "2": ["half", 0],
              "1.75": ["quarter", 2], "1.5": ["quarter", 1], "1": ["quarter", 0], "0.75": ["eighth", 1],
              "0.5": ["eighth", 0], "0.25": ["16th", 0],
            };
            const type = pitch === "R" ? ["whole", 0] : notation[written_value];
            if (!type) throw new Error(`Unsupported transcription duration: ${value}`);
            const pitches = pitch.split("+");
            const fingers = finger?.split(",") ?? [];
            if (fingers.length && fingers.length !== pitches.length) throw new Error(`Finger count mismatch: ${token}`);
            for (const [pitch_index, pitch_name] of pitches.entries()) {
              const note: Record<string, unknown>[] = [];
              if (grace) note.push({ grace: [], ":@": { "@_slash": "yes" } });
              if (pitch_index) note.push({ chord: [] });
              if (pitch_name === "r" || pitch_name === "R") note.push({
                rest: [], ...(pitch_name === "R" ? { ":@": { "@_measure": "yes" } } : {}),
              });
              else {
                const spelling = /^([A-G])([#bn]?)(-?\d)$/u.exec(pitch_name)!;
                note.push({ pitch: [
                  { step: [{ "#text": spelling[1] }] },
                  ...(spelling[2] ? [{ alter: [{ "#text": spelling[2] === "#" ? 1 : spelling[2] === "b" ? -1 : 0 }] }] : []),
                  { octave: [{ "#text": Number(spelling[3]) }] },
                ] });
              }
              note.push(
                ...(grace ? [] : [{ duration: [{ "#text": duration * 960 }] }]),
                ...(!tie ? [] : (tie === "continue" ? ["stop", "start"] : [tie])
                  .map((kind) => ({ tie: [], ":@": { "@_type": kind } }))),
                { voice: [{ "#text": voice }] },
                { type: [{ "#text": type[0] }] },
                ...Array.from({ length: Number(type[1]) }, () => ({ dot: [] })),
                ...(pitch_name.includes("n") ? [{ accidental: [{ "#text": "natural" }] }] : []),
                ...(triplet ? [{ "time-modification": [
                  { "actual-notes": [{ "#text": 3 }] },
                  { "normal-notes": [{ "#text": 2 }] },
                  { "normal-type": [{ "#text": type[0] }] },
                ] }] : []),
                { staff: [{ "#text": staff }] },
              );
              const notations: Record<string, unknown>[] = [];
              if (fingers[pitch_index]) notations.push({ technical: [{ fingering: [{ "#text": fingers[pitch_index] }] }] });
              if (tie) notations.push(...(tie === "continue" ? ["stop", "start"] : [tie])
                .map((kind) => ({ tied: [], ":@": { "@_type": kind } })));
              if (!pitch_index && articulation) notations.push(articulation === "fermata"
                ? { fermata: [], ":@": { "@_type": "upright" } }
                : { articulations: [{ [articulation]: [] }] });
              if (!pitch_index && slur) notations.push({
                slur: [], ":@": { "@_type": slur, "@_number": 1 },
              });
              if (notations.length) note.push({ notations });
              nodes.push({ note });
            }
            total += duration;
          }
          if (Math.abs(total - length) > 1e-8) {
            throw new Error(`PDF ${section.page} ${section.title} line ${line_index + 1} bar ${bar_index + 1} staff ${staff}: ${total} != ${length}`);
          }
        }
        if (!hands) throw new Error("Empty transcribed measure");
        if (bar.repeat_end || bar.ending_stop) nodes.push({
          barline: [
            ...(bar.ending_stop ? [{ ending: [], ":@": { "@_number": bar.ending_stop, "@_type": bar.repeat_end ? "stop" : "discontinue" } }] : []),
            ...(bar.repeat_end ? [{ repeat: [], ":@": { "@_direction": "backward" } }] : []),
          ], ":@": { "@_location": "right" },
        });
        else if (section.unmetered) {
          nodes.push({ barline: [{ "bar-style": [{ "#text": "none" }] }], ":@": { "@_location": "right" } });
        } else if (!section.continues && line_index === section.lines.length - 1 && bar_index === line.length - 1) {
          nodes.push({ barline: [{ "bar-style": [{ "#text": "light-heavy" }] }], ":@": { "@_location": "right" } });
        }
        measures.push({ measure: nodes, ":@": {
          "@_number": String(measures.length + 1),
          ...(bar.quarters === undefined ? {} : { "@_implicit": "yes" }),
        } });
        previous_page = section.page;
      }
    }
  }
  // Retain identification and source provenance; replace only OMR musical data.
  delete score.part;
  delete score["part-list"];
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const header = builder.build({ "score-partwise": score });
  const ordered = new XMLParser({ ignoreAttributes: false, preserveOrder: true }).parse(header);
  const root = ordered[0]["score-partwise"];
  root.push({ "part-list": [{ "score-part": [{ "part-name": [{ "#text": "Piano" }] }], ":@": { "@_id": "P1" } }] });
  root.push({ part: measures, ":@": { "@_id": "P1" } });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLBuilder({ ignoreAttributes: false, preserveOrder: true, format: true }).build(ordered);
}
