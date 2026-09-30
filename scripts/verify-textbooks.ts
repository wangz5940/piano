#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse_musicxml_to_score_document } from "../src/features/calibration/musicxml.ts";
import { load_jianpu_catalog, load_jianpu_score } from "../src/features/jianpu/loadJianpuLibrary.ts";
import { to_render_score_from_jianpu_score } from "../src/features/jianpu/render/normalizeJianpuScore.ts";
import type { score_document } from "../src/features/score/types.ts";
import type { calibration_project } from "../src/features/calibration/types.ts";
import type { jianpu_event } from "../src/features/jianpu/types.ts";

const root = resolve(import.meta.dirname, "..");
const argument = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
const directory = argument ? resolve(root, argument, "staged/public") : resolve(root, "public");
const report_path = argument
  ? resolve(root, argument, "report.json")
  : resolve(root, "reports/textbook-pdf-calibration.json");
const report = JSON.parse(readFileSync(report_path, "utf8")) as { results: Array<{ id: string }> };
const expected = new Set(report.results.map((item) => item.id));
const asset = (url: string) => {
  assert(url.startsWith("/materials/") && !url.includes(".."));
  const staged = resolve(directory, url.slice(1));
  return existsSync(staged) ? staged : resolve(root, "public", url.slice(1));
};
globalThis.fetch = async (input) => {
  const url = String(input);
  return new Response(readFileSync(asset(url.startsWith("/api/")
    ? "/materials/jianpu-catalog.json" : url), "utf8"));
};
const catalog = await load_jianpu_catalog();
let checked = 0;
let notes = 0;
for (const material of catalog.materials) {
  for (const segment of material.segments) {
    if (!expected.has(segment.id)) continue;
    const score = await load_jianpu_score(segment.jianpu_url);
    const rendered = to_render_score_from_jianpu_score(score);
    const { project, musicxml_sha256 } = JSON.parse(readFileSync(asset(
      `/materials/calibration/${material.id}/${String(segment.sequence).padStart(3, "0")}.json`,
    ), "utf8")) as { project: calibration_project; musicxml_sha256: string };
    const document = project.document;
    const xml = readFileSync(asset(segment.musicxml_url), "utf8");
    assert.equal(createHash("sha256").update(xml).digest("hex"), musicxml_sha256);
    const imported = parse_musicxml_to_score_document(xml, project.work).document;
    assert.deepEqual(timeline(imported), timeline(document), `${segment.id}: XML/document timing or pitches`);
    assert.equal(rendered.measures.length, document.measures.length);
    assert.equal(score.measures.length, segment.measure_count);
    assert.equal(segment.page_slices.at(-1)?.measure_end, score.measures.length);
    for (const [index, measure] of document.measures.entries()) {
      const output = score.measures[index];
      assert.deepEqual(output.meter, measure.meter);
      assert.equal(output.tonic_midi, measure.tonic_midi);
      const projected: jianpu_event[] = measure.events.map((event) => ({
        onset_beats: event.onset_beats, duration_beats: event.duration_beats,
        right_notes: event.hand === "right" ? event.notes.map((note) => note.midi) : [],
        left_notes: event.hand === "left" ? event.notes.map((note) => note.midi) : [],
        right_rest: event.hand === "right" && event.notes.length === 0,
        left_rest: event.hand === "left" && event.notes.length === 0,
      }));
      assert.deepEqual(jianpu_timeline(output.events), jianpu_timeline(projected),
        `${segment.id}: jianpu timing/pitch/hand/rest mismatch at ${index + 1}`);
      assert.equal(output.index, index + 1);
    }
    const practice = JSON.parse(readFileSync(asset(segment.musicxml_url.replace(
      /\.musicxml$/u, ".practice.json",
    )), "utf8")) as { events: Array<{
      onset_beats: number;
      source_events: Array<{ id: string; hand: string; voice: number; onset_beats?: number; duration_beats: number; notes: number[] }>;
    }> };
    const actual_events = practice.events.flatMap((group) =>
      group.source_events.map((event) => [
        event.id, event.hand, event.voice, rounded(event.onset_beats ?? group.onset_beats),
        rounded(event.duration_beats), event.notes,
      ])).sort();
    const expected_events = document.measures.flatMap((measure) =>
      measure.events.filter((event) => event.notes.length).map((event) => [
        event.id, event.hand, event.voice, rounded(event.onset_beats),
        rounded(event.duration_beats), event.notes.map((note) => note.midi),
      ])).sort();
    assert.deepEqual(actual_events, expected_events, `${segment.id}: practice source voice mismatch`);
    assert.equal(document.status, "needs_review");
    notes += document.measures.reduce((sum, measure) =>
      sum + measure.events.reduce((count, event) => count + event.notes.length, 0), 0);
    checked += 1;
  }
}
assert.equal(checked, expected.size);
console.log(`Verified ${checked} segments / ${notes} notes: XML, document, jianpu loader/render, page ranges and practice voices.`);

function rounded(value: number): number {
  return Number(value.toFixed(4));
}
function timeline(document: score_document) {
  return document.measures.map((measure) => ({
    number: measure.number,
    meter: measure.meter,
    events: measure.events.map((event) => [
      rounded(event.onset_beats), rounded(event.duration_beats), event.voice,
      event.notes.map((note) => note.midi).sort((a, b) => a - b),
      event.grace ?? null,
    ]).sort(),
  }));
}
function jianpu_timeline(events: jianpu_event[]) {
  const pitches = new Set<string>();
  for (const event of events) {
    for (const hand of ["left", "right"] as const) {
      const notes = event[`${hand}_notes`];
      for (const pitch of notes.length ? notes : event[`${hand}_rest`] ? ["rest"] : []) {
        pitches.add(JSON.stringify([hand, rounded(event.onset_beats), rounded(event.duration_beats), pitch]));
      }
    }
  }
  // Rest and note in different source voices may coincide; the hand display
  // keeps the sounding note, while the full document keeps both voices.
  const rests = [...pitches].filter((key) => key.endsWith(',"rest"]'));
  for (const rest of rests) {
    if ([...pitches].some((key) => key !== rest && key.startsWith(rest.slice(0, -7)))) pitches.delete(rest);
  }
  return [...pitches].sort();
}
