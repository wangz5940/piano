import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { read_source_transcription } from "./lib/sourceTranscription";
import type { jianpu_catalog } from "../src/features/jianpu/types";

// Only content metadata changes. MusicXML, score data and calibration IDs stay intact.
const root = resolve(import.meta.dirname, "..");
const path = resolve(root, "public/materials/jianpu-catalog.json");
const catalog: jianpu_catalog = JSON.parse(readFileSync(path, "utf8"));
let indexed = 0;
for (const material of catalog.materials) {
  for (const segment of material.segments) {
    const source = resolve(root, "scripts/textbook-transcriptions", `${segment.id}.json`);
    if (!existsSync(source)) continue;
    const transcription = read_source_transcription(source);
    let next_measure = 1;
    const sections = transcription.sections.map((section) => {
      const chapter = material.chapters.find((item) =>
        section.page >= item.page_start && section.page <= item.page_end);
      if (!chapter) throw new Error(`${segment.id}: missing chapter for page ${section.page}`);
      const start = next_measure;
      next_measure += section.lines.reduce((sum, line) => sum + line.length, 0);
      return {
        source_pages: [section.page],
        title: section.title,
        text: material.pages.find((page) => page.page === section.page)?.text || section.title,
        measure_start: start,
        measure_end: next_measure - 1,
        chapter_id: chapter.id,
        chapter_title: chapter.title,
        mapping: "verified" as const,
        ...(section.continues ? { continues: true } : {}),
      };
    });
    const score = JSON.parse(readFileSync(resolve(root, "public", segment.jianpu_url.slice(1)), "utf8"));
    if (next_measure - 1 !== segment.measure_count || score.measures.length !== segment.measure_count) {
      throw new Error(`${segment.id}: transcription no longer matches the current score; review boundaries`);
    }
    segment.content_sections = sections;
    indexed += sections.length;
  }
}
writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Indexed ${indexed} verified content sections without changing source music.`);
