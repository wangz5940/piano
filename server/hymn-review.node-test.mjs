import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { hash_password } from "./auth.mjs";
import { create_request_handler } from "./app.mjs";
import { open_database } from "./database.mjs";

const source_reference = Object.freeze({
  slide_number: 1,
  shape_id: "shape-score-1",
  paragraph_index: 0,
  run_index: 0,
});

test("诗歌候选可创建、完整修订、门禁拒绝后发布为不可变版本", async (context) => {
  const fixture = await create_fixture();
  context.after(() => fixture.close());
  const admin_cookie = await create_admin_session(fixture);

  const created = await fixture.request("/api/v1/admin/hymn-candidates", {
    method: "POST",
    cookie: admin_cookie,
    body: create_candidate_input(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.candidate.score.id, "hymn-score-001");
  assert.equal(created.data.candidate.draft.document.status, "needs_review");
  assert.equal(created.data.candidate.draft.hymn_review.slides.length, 1);
  assert.match(
    created.data.candidate.draft.hymn_review.slides[0].source_svg,
    /data-document-type="pptx-source-svg"/,
  );
  const draft_id = created.data.candidate.draft.id;

  const rejected_publish = await fixture.request(
    `/api/v1/admin/score-drafts/${draft_id}/publish`,
    {
      method: "POST",
      cookie: admin_cookie,
      body: {},
    },
  );
  assert.equal(rejected_publish.status, 409);
  assert.equal(rejected_publish.data.error, "score_publish_blocked");
  assert.match(rejected_publish.data.message, /未知字形/);

  const edited_document = structuredClone(created.data.candidate.draft.document);
  const event = edited_document.measures[0].events[0];
  const note = event.notes[0];
  note.midi = 62;
  note.finger = 2;
  note.fingering = confirmed_annotation("管理员确认指法");
  event.duration_beats = 0.5;
  event.hand = "left";
  event.chord = "Dm";
  event.chord_annotation = confirmed_annotation("管理员确认和弦");
  edited_document.lyrics = [{
    id: "lyric-1",
    stanza_number: 1,
    text: "奇异恩典",
    language: "zh-CN",
    event_ids: ["event-1"],
    range: null,
    slide_number: 1,
    annotation: confirmed_annotation("管理员确认歌词关联"),
  }];
  edited_document.hand_positions = [{
    id: "position-1",
    hand: "left",
    range: {
      start: { measure_id: "measure-1", beat: 0 },
      end: { measure_id: "measure-1", beat: 1 },
    },
    position_name: "D3 Position",
    covered_midis: [50, 52, 53, 55, 57],
    finger_map: [
      { finger: 1, midi: 50 },
      { finger: 2, midi: 52 },
      { finger: 3, midi: 53 },
      { finger: 4, midi: 55 },
      { finger: 5, midi: 57 },
    ],
    movement: "move",
    annotation: confirmed_annotation("管理员确认手位"),
  }];

  const saved = await fixture.request(
    `/api/v1/admin/score-drafts/${draft_id}`,
    {
      method: "PATCH",
      cookie: admin_cookie,
      body: {
        document: edited_document,
        review: {
          review_state: "reviewed",
          issues: [{
            id: "unknown-1",
            code: "unknown_glyph",
            kind: "unknown_glyph",
            severity: "error",
            status: "resolved",
            message: "未知字形已与来源核对。",
            source_refs: [source_reference],
          }],
          normalized_slides: [{
            slide_number: 1,
            svg: normalized_svg("2"),
          }],
        },
      },
    },
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.data.draft.document.status, "reviewed");
  assert.equal(
    saved.data.draft.document.measures[0].events[0].notes[0].midi,
    62,
  );
  assert.equal(saved.data.draft.document.measures[0].events[0].hand, "left");
  assert.equal(saved.data.draft.document.measures[0].events[0].chord, "Dm");
  assert.equal(saved.data.draft.document.lyrics[0].text, "奇异恩典");
  assert.equal(saved.data.draft.document.hand_positions[0].position_name, "D3 Position");
  assert.equal(saved.data.draft.hymn_review.review_state, "reviewed");
  assert.equal(saved.data.draft.hymn_review.issues[0].status, "resolved");

  const edit_events = fixture.repository.raw.prepare(`
    SELECT command_json FROM score_edit_events WHERE draft_id = ?
  `).all(draft_id);
  assert.equal(edit_events.length, 1);
  assert.equal(JSON.parse(edit_events[0].command_json).type, "replace_document");

  const published = await fixture.request(
    `/api/v1/admin/score-drafts/${draft_id}/publish`,
    {
      method: "POST",
      cookie: admin_cookie,
      body: {},
    },
  );
  assert.equal(published.status, 200);
  assert.equal(published.data.version.version_number, 1);
  assert.equal(published.data.version.document.status, "published");
  assert.equal(published.data.version.hymn_review.review_state, "published");
  assert.equal(published.data.version.document.lyrics[0].text, "奇异恩典");

  const immutable_document = fixture.repository.raw.prepare(`
    SELECT document_json FROM score_versions WHERE id = ?
  `).get(published.data.version.id).document_json;
  const rejected_save = await fixture.request(
    `/api/v1/admin/score-drafts/${draft_id}`,
    {
      method: "PATCH",
      cookie: admin_cookie,
      body: {
        document: edited_document,
        review: {
          review_state: "reviewed",
          issues: [],
          normalized_slides: [{
            slide_number: 1,
            svg: normalized_svg("3"),
          }],
        },
      },
    },
  );
  assert.equal(rejected_save.status, 404);
  assert.equal(
    fixture.repository.raw.prepare(`
      SELECT document_json FROM score_versions WHERE id = ?
    `).get(published.data.version.id).document_json,
    immutable_document,
  );
  const published_edit_event = fixture.repository.raw.prepare(`
    SELECT draft_id, score_version_id
    FROM score_edit_events
    WHERE score_version_id = ?
  `).get(published.data.version.id);
  assert.equal(published_edit_event.draft_id, null);
  assert.equal(published_edit_event.score_version_id, published.data.version.id);
});

function create_candidate_input() {
  return {
    score: {
      id: "hymn-score-001",
      slug: "hymn-001",
      title: "奇异恩典",
    },
    document: {
      schema_version: 2,
      id: "hymn-score-001",
      number: "001",
      title: "奇异恩典",
      key_signature: "C major",
      tonic_midi: 60,
      time_signature: "4/4",
      status: "needs_review",
      provenance: {
        kind: "pptx",
        source_id: "hymn-pptx-001",
        source_file: "001 奇异恩典.pptx",
        source_sha256: "a".repeat(64),
        font_config_version: "simpmusic-font-v1",
        importer_version: "pptx-importer-v1",
        references: [source_reference],
      },
      lyrics: [],
      hand_positions: [],
      measures: [{
        id: "measure-1",
        number: "1",
        meter: { beats: 4, beat_unit: 4 },
        events: [{
          id: "event-1",
          onset_beats: 0,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{
            id: "note-1",
            midi: 60,
            source_refs: [source_reference],
          }],
          source_refs: [source_reference],
        }],
      }],
      review: {
        reviewed_by: null,
        reviewed_at: null,
        published_by: null,
        published_at: null,
        note: "等待来源校对",
      },
    },
    review: {
      review_state: "needs_review",
      font_config_version: "simpmusic-font-v1",
      slides: [{
        slide_number: 1,
        source_svg: source_svg(),
        normalized_svg: normalized_svg("1"),
        source_refs: [source_reference],
      }],
      issues: [{
        id: "unknown-1",
        code: "unknown_glyph",
        kind: "unknown_glyph",
        severity: "error",
        status: "unresolved",
        message: "存在一个未识别的 SimpMusic 字形。",
        source_refs: [source_reference],
      }],
    },
  };
}

function confirmed_annotation(reason) {
  return {
    source: "manual",
    status: "confirmed",
    reason,
    confirmed_by: "admin-reviewer",
    confirmed_at: "2026-07-24T08:00:00.000Z",
    source_refs: [source_reference],
  };
}

function source_svg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ' data-document-type="pptx-source-svg" viewBox="0 0 960 540">',
    '<text data-source-shape-id="shape-score-1">SimpMusic source</text>',
    "</svg>",
  ].join("");
}

function normalized_svg(note) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ' data-document-type="normalized-teaching-svg" viewBox="0 0 960 540">',
    `<text>${note}</text>`,
    "</svg>",
  ].join("");
}

async function create_admin_session(fixture) {
  const password = await hash_password("administrator-password");
  fixture.repository.create_user({
    email: "reviewer@example.com",
    display_name: "诗歌校对员",
    role: "admin",
    ...password,
  });
  const login = await fixture.request("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: "reviewer@example.com",
      password: "administrator-password",
    },
  });
  assert.equal(login.status, 200);
  return login.cookie;
}

async function create_fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "panio-hymn-review-"));
  const static_root = resolve(root, "dist");
  const uploads_root = resolve(root, "content");
  const catalog_path = resolve(root, "catalog.json");
  mkdirSync(static_root, { recursive: true });
  writeFileSync(resolve(static_root, "index.html"), "<main>Panio</main>");
  writeFileSync(catalog_path, JSON.stringify({
    schema_version: "1.0",
    generated_at: "2026-07-24",
    review_only: false,
    notice: "",
    materials: [],
  }));

  const repository = open_database(":memory:");
  const server = createServer(create_request_handler({
    repository,
    static_root,
    uploads_root,
    catalog_path,
    global_rate_limit: 1_000,
    auth_rate_limit: 100,
    logger: () => {},
  }));
  await new Promise((resolve_listen) => server.listen(0, "127.0.0.1", resolve_listen));
  const address = server.address();
  const base_url = `http://127.0.0.1:${address.port}`;

  return {
    repository,
    async request(path, {
      method = "GET",
      body,
      cookie,
    } = {}) {
      const headers = {};
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        headers["X-Panio-Client"] = "web";
      }
      if (cookie) {
        headers.Cookie = cookie;
      }
      const response = await fetch(`${base_url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set_cookie = response.headers.get("set-cookie") ?? "";
      return {
        status: response.status,
        cookie: set_cookie.split(";", 1)[0],
        data: await response.json(),
      };
    },
    async close() {
      await new Promise((resolve_close) => server.close(resolve_close));
      repository.close();
      rmSync(root, { force: true, recursive: true });
    },
  };
}
