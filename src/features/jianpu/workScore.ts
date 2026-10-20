import { load_musicxml_text } from "@/features/assets/loadCatalog";
import { complete_work_title } from "./contentGrouping";
import { load_jianpu_score } from "./loadJianpuLibrary";
import type { jianpu_score, jianpu_segment, jianpu_source_range } from "./types";
import { load_calibration_projects } from "@/features/calibration/storage";

/** Warm raw public sources only. Personal edits are resolved afresh when opened. */
export async function prefetch_work_musicxml(segment: jianpu_segment): Promise<void> {
  const urls = segment.sources?.map((source) => source.musicxml_url) ?? [segment.musicxml_url];
  await Promise.all([...new Set(urls)].map(load_musicxml_text));
}

export async function load_work_score(segment: jianpu_segment, user_id?: string): Promise<jianpu_score> {
  const projects = user_id ? load_calibration_projects(localStorage, user_id) : [];
  const load = async (segment_id: string, url: string) => {
    const project = projects.find((item) => item.id.endsWith(`:${segment_id}`));
    if (!project) return load_jianpu_score(url);
    const { personal_jianpu_score } = await import("@/features/calibration/personalScore");
    return personal_jianpu_score(project, segment_id);
  };
  if (!segment.sources) return load(segment.id, segment.jianpu_url);
  const scores = await Promise.all(segment.sources.map((source) => load(source.segment_id, source.jianpu_url)));
  return combine_work_scores(segment, scores);
}

export function combine_work_scores(segment: jianpu_segment, scores: jianpu_score[]): jianpu_score {
  const measures = segment.sources!.flatMap((source, index) =>
    scores[index].measures.slice(source.measure_start - 1, source.measure_end).map((measure) => ({
      ...measure,
      meter: measure.meter ?? parse_meter(scores[index].time_signature),
      key_signature: measure.key_signature ?? scores[index].key_signature,
      tonic_midi: measure.tonic_midi ?? scores[index].tonic_midi,
      directions: measure.directions.filter((text) =>
        complete_work_title(text) !== segment.title && text !== source.title),
    })),
  ).map((measure, index) => ({ ...measure, index: index + 1, number: String(index + 1) }));
  if (measures.length !== segment.measure_count) throw new Error("曲目小节与来源不一致");
  return {
    ...scores[0],
    segment_id: segment.id,
    time_signature: `${measures[0].meter.beats}/${measures[0].meter.beat_unit}`,
    key_signature: measures[0].key_signature,
    tonic_midi: measures[0].tonic_midi,
    measures,
  };
}

export async function load_work_musicxml(segment: jianpu_segment, user_id?: string): Promise<string> {
  const sources = segment.sources ?? [{
    segment_id: segment.id, jianpu_url: segment.jianpu_url,
    musicxml_url: segment.musicxml_url, measure_start: 1,
    measure_end: segment.measure_count, title: segment.title,
  }];
  const projects = user_id ? load_calibration_projects(localStorage, user_id) : [];
  const texts = await Promise.all(sources.map(async (source) => {
    const project = projects.find((item) => item.id.endsWith(`:${source.segment_id}`));
    if (!project) return load_musicxml_text(source.musicxml_url);
    const { score_document_to_musicxml } = await import("@/features/assets/scoreDocumentMusicXml");
    return score_document_to_musicxml(project.document, project.event_metadata);
  }));
  return combine_work_musicxml(sources, texts, segment.title);
}

/** Keep original XML nodes (ties, voices, fingering, repeats, etc.) verbatim. */
export function combine_work_musicxml(sources: jianpu_source_range[], texts: string[], title: string): string {
  const documents = texts.map((text) => new DOMParser().parseFromString(text, "application/xml"));
  if (documents.some((document) => document.querySelector("parsererror") ||
    document.documentElement.tagName !== "score-partwise")) throw new Error("原谱格式无法拼接");
  const output = documents[0].cloneNode(true) as XMLDocument;
  const parts = [...output.documentElement.children].filter((node) => node.tagName === "part");
  const source_parts = documents.map((document) =>
    [...document.documentElement.children].filter((node) => node.tagName === "part"));
  if (source_parts.some((items) => items.length !== parts.length)) {
    throw new Error("跨文件声部不一致，需要校对后合并");
  }
  for (const [part_index, part] of parts.entries()) {
    part.replaceChildren();
    let number = 0;
    for (const [index, source] of sources.entries()) {
      const measures = [...source_parts[index][part_index].children].filter((node) => node.tagName === "measure");
      const selected = measures.slice(source.measure_start - 1, source.measure_end);
      if (selected.length !== source.measure_end - source.measure_start + 1) {
        throw new Error("原谱小节边界与目录不一致");
      }
      const inherited = new Map<string, Element>();
      for (const measure of measures.slice(0, source.measure_start - 1)) {
        for (const attrs of [...measure.children].filter((node) => node.tagName === "attributes")) {
          for (const node of attrs.children) inherited.set(`${node.tagName}:${node.getAttribute("number") ?? ""}`, node);
        }
      }
      for (const [measure_index, original] of selected.entries()) {
        const measure = output.importNode(original, true);
        measure.setAttribute("number", String(++number));
        measure.querySelectorAll("print").forEach((node) => node.remove());
        if (measure_index === 0) {
          // Materialize inherited clefs, meter, key and divisions at every source boundary.
          // Mid-measure changes must stay at their original rhythmic position.
          for (const child of [...measure.children]) {
            if (["note", "backup", "forward"].includes(child.tagName)) break;
            if (child.tagName !== "attributes") continue;
            for (const node of child.children) {
              inherited.set(`${node.tagName}:${node.getAttribute("number") ?? ""}`, node);
            }
            child.remove();
          }
          const attributes = output.createElement("attributes");
          for (const node of inherited.values()) attributes.append(output.importNode(node, true));
          measure.prepend(attributes);
        }
        for (const words of measure.querySelectorAll("direction-type > words")) {
          const text = words.textContent?.trim() ?? "";
          if (text === source.title || complete_work_title(text) === title) {
            const type = words.parentElement!;
            words.remove();
            if (!type.children.length) {
              const direction = type.parentElement!;
              type.remove();
              if (!direction.querySelector("direction-type")) direction.remove();
            }
          }
        }
        part.append(measure);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(output)}`;
}

function parse_meter(value: string) {
  const [beats, beat_unit] = value.split("/").map(Number);
  return { beats: beats || 4, beat_unit: beat_unit || 4 };
}
