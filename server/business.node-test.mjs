import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  create_session_credentials,
  hash_password,
  parse_session_cookie,
  verify_password,
} from "./auth.mjs";
import {
  create_request_handler,
  score_document_to_jianpu_score,
  score_document_to_musicxml,
} from "./app.mjs";
import { open_database } from "./database.mjs";

test("密码使用随机盐并能验证正确密码", async () => {
  const first = await hash_password("correct-password");
  const second = await hash_password("correct-password");

  assert.notEqual(first.password_hash, second.password_hash);
  assert.equal(await verify_password("correct-password", first), true);
  assert.equal(await verify_password("wrong-password", first), false);
  assert.equal(parse_session_cookie("a=1; panio_session=abc_123-XYZ; b=2").token, undefined);
  const session = create_session_credentials();
  assert.equal(parse_session_cookie(`panio_session=${session.token}`).token, session.token);
});

test("SQLite 初始化完整业务表和外键", () => {
  const repository = open_database(":memory:");
  const tables = repository.raw.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);

  assert.equal(repository.get_schema_version(), 7);
  assert.deepEqual(tables, [
    "audit_events",
    "content_items",
    "content_versions",
    "curriculum_nodes",
    "curriculum_revisions",
    "curriculums",
    "lesson_score_bindings",
    "material_deletions",
    "material_reviews",
    "practice_sessions",
    "schema_migrations",
    "score_calibrations",
    "score_drafts",
    "score_edit_events",
    "score_versions",
    "scores",
    "sessions",
    "user_snapshots",
    "users",
  ]);
  assert.equal(
    repository.raw.prepare(`
      SELECT document_schema_version AS version
      FROM score_versions
      WHERE id = 'score-demo-c-major-v1'
    `).get().version,
    2,
  );
  assert.equal(
    repository.get_score_version("score-demo-c-major-v1").document.schema_version,
    2,
  );
  assert.equal(repository.raw.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  repository.close();
});

test("MusicXML 导出保留 Slur 起止标记", () => {
  const document = {
    key_signature: "G major",
    tonic_midi: 67,
    time_signature: "4/4",
    measures: [{
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "event-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "start",
        notes: [{ midi: 60, finger: 1, source_refs: [] }],
      }, {
        id: "event-stop",
        onset_beats: 1,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "continue",
        notes: [{ midi: 60, source_refs: [] }],
      }, {
        id: "event-tie-stop",
        onset_beats: 2,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        tie: "stop",
        notes: [{ midi: 60, source_refs: [] }],
      }, {
        id: "left-event",
        onset_beats: 0,
        duration_beats: 4,
        hand: "left",
        voice: 2,
        notes: [{ midi: 60, source_refs: [] }],
      }],
    }],
  };
  const xml = score_document_to_musicxml(document, {
    "event-start": {
      staff: 1,
      clef: "treble",
      dynamics: "mf",
      articulation: "staccato",
      slur: "start",
    },
    "event-stop": { staff: 1, clef: "treble", slur: "stop" },
    "left-event": { staff: 1, clef: "bass", slur: "none" },
  });

  assert.match(xml, /<fifths>1<\/fifths>/);
  assert.match(xml, /<clef number="1">\n\s*<sign>G<\/sign>\n\s*<line>2<\/line>\n\s*<\/clef>/);
  assert.match(xml, /<clef number="2">\n\s*<sign>G<\/sign>\n\s*<line>2<\/line>\n\s*<\/clef>/);
  assert.match(xml, /<staff>2<\/staff>/);
  assert.doesNotMatch(xml, /<sign>F<\/sign>/);
  assert.match(xml, /<mf\/>/);
  assert.match(xml, /<staccato\/>/);
  assert.match(xml, /<fingering>1<\/fingering>/);
  assert.equal((xml.match(/<tie type="start"\/>/g) ?? []).length, 2);
  assert.equal((xml.match(/<tie type="stop"\/>/g) ?? []).length, 2);
  assert.equal((xml.match(/<tied type="start"\/>/g) ?? []).length, 2);
  assert.equal((xml.match(/<tied type="stop"\/>/g) ?? []).length, 2);
  assert.doesNotMatch(xml, /type="continue"/);
  assert.match(xml, /<slur type="start" number="1"\/>/);
  assert.match(xml, /<slur type="stop" number="1"\/>/);
});

test("MusicXML 导出按手别栈为嵌套 Slur 编号", () => {
  const document = {
    schema_version: 2,
    id: "nested-slur-fixture",
    title: "嵌套连线样本",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    measures: [{
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "right-outer-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ midi: 72, source_refs: [] }],
      }, {
        id: "right-inner-start",
        onset_beats: 1,
        duration_beats: 1,
        hand: "right",
        voice: 2,
        notes: [{ midi: 74, source_refs: [] }],
      }, {
        id: "left-stop",
        onset_beats: 1.5,
        duration_beats: 1,
        hand: "left",
        voice: 2,
        notes: [{ midi: 48, source_refs: [] }],
      }, {
        id: "right-inner-stop",
        onset_beats: 2,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ midi: 76, source_refs: [] }],
      }, {
        id: "right-outer-stop",
        onset_beats: 3,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ midi: 77, source_refs: [] }],
      }],
    }],
  };
  const xml = score_document_to_musicxml(document, {
    "right-outer-start": { slur: "start" },
    "right-inner-start": { slur: "start" },
    "left-stop": { slur: "stop" },
    "right-inner-stop": { slur: "stop" },
    "right-outer-stop": { slur: "stop" },
  });

  assert.match(xml, /<slur type="start" number="1"\/>/);
  assert.match(xml, /<slur type="start" number="2"\/>/);
  assert.match(xml, /<slur type="stop" number="2"\/>/);
  assert.match(xml, /<slur type="stop" number="1"\/>/);
  assert.doesNotMatch(xml, /<slur type="stop" number="3"\/>/);
});

test("MusicXML 导出为同时打开的左右手 Slur 使用不同编号", () => {
  const document = {
    schema_version: 2,
    id: "parallel-hand-slur-fixture",
    title: "双手连线样本",
    key_signature: "C major",
    tonic_midi: 60,
    time_signature: "4/4",
    measures: [{
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [{
        id: "right-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ midi: 72, source_refs: [] }],
      }, {
        id: "left-start",
        onset_beats: 0,
        duration_beats: 2,
        hand: "left",
        voice: 2,
        notes: [{ midi: 48, source_refs: [] }],
      }, {
        id: "left-stop",
        onset_beats: 2,
        duration_beats: 2,
        hand: "left",
        voice: 2,
        notes: [{ midi: 52, source_refs: [] }],
      }, {
        id: "right-stop",
        onset_beats: 3,
        duration_beats: 1,
        hand: "right",
        voice: 1,
        notes: [{ midi: 74, source_refs: [] }],
      }],
    }],
  };
  const xml = score_document_to_musicxml(document, {
    "right-start": { slur: "start" },
    "left-start": { slur: "start" },
    "left-stop": { slur: "stop" },
    "right-stop": { slur: "stop" },
  });

  const slur_tags = xml.match(/<slur[^>]+\/>/g);
  assert.ok(slur_tags.includes('<slur type="start" number="1"/>'));
  assert.ok(slur_tags.includes('<slur type="start" number="2"/>'));
  assert.ok(slur_tags.includes('<slur type="stop" number="1"/>'));
  assert.ok(slur_tags.includes('<slur type="stop" number="2"/>'));
});

test("简谱导出对同音高多声部只保留一个指法", () => {
  const score = score_document_to_jianpu_score({
    measures: [{
      number: "1",
      events: [{
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        notes: [{ midi: 60, finger: 1 }],
      }, {
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        notes: [{ midi: 60, finger: 2 }],
      }],
    }],
  }, "beyer.segment.test");

  assert.deepEqual(score.measures[0].events[0].right_notes, [60]);
  assert.equal(score.measures[0].events[0].right_fingerings.length, 1);
});

test("简谱导出保留左右手独立 Slur 标记", () => {
  const score = score_document_to_jianpu_score({
    measures: [{
      number: "1",
      events: [{
        id: "right-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
        notes: [{ midi: 72, finger: 1 }],
      }, {
        id: "left-start",
        onset_beats: 0,
        duration_beats: 1,
        hand: "left",
        notes: [{ midi: 48, finger: 5 }],
      }, {
        id: "right-stop",
        onset_beats: 1,
        duration_beats: 1,
        hand: "right",
        notes: [{ midi: 74, finger: 2 }],
      }, {
        id: "left-stop",
        onset_beats: 2,
        duration_beats: 1,
        hand: "left",
        notes: [{ midi: 50, finger: 4 }],
      }],
    }],
  }, "beyer.segment.slur", {
    "right-start": { slur: "start" },
    "left-start": { slur: "start" },
    "right-stop": { slur: "stop" },
    "left-stop": { slur: "stop" },
  });

  assert.equal(score.measures[0].events[0].right_slur, "start");
  assert.equal(score.measures[0].events[0].left_slur, "start");
  assert.equal(score.measures[0].events[1].right_slur, "stop");
  assert.equal(score.measures[0].events[2].left_slur, "stop");
});

test("业务 API 支持账号、同步、练习归档和管理员内容版本", async (context) => {
  const fixture = await create_fixture();
  context.after(() => fixture.close());

  const rejected_role = await fixture.request("/api/v1/auth/register", {
    method: "POST",
    body: {
      email: "elevate@example.com",
      display_name: "越权账号",
      password: "student-password",
      role: "admin",
    },
  });
  assert.equal(rejected_role.status, 400);

  const registration = await fixture.request("/api/v1/auth/register", {
    method: "POST",
    body: {
      email: "student@example.com",
      display_name: "小琴",
      password: "student-password",
      role: "student",
    },
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.data.user.role, "student");
  const student_cookie = registration.cookie;
  assert.match(student_cookie, /^panio_session=/);
  assert.match(registration.set_cookie, /HttpOnly/);
  assert.match(registration.set_cookie, /SameSite=Lax/);

  const me = await fixture.request("/api/v1/auth/me", {
    cookie: student_cookie,
  });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, "student@example.com");

  const progress = {
    schema_version: 2,
    current_phase_id: "hand-foundation",
    current_week_number: 1,
    current_day_index: 1,
    completed_lesson_ids: ["w1-d1-technique"],
    results_by_lesson: {
      "w1-d1-technique": [{
        lesson_id: "w1-d1-technique",
        started_at: 1_000,
        completed_at: 2_000,
        total_steps: 8,
        correct_steps: 8,
        mistakes: 0,
        early_steps: 0,
        late_steps: 0,
        max_combo: 8,
        accuracy: 1,
        completed: true,
        input_source: "midi",
        bpm: 52,
        duration_ms: 1_000,
      }],
    },
    weak_lesson_ids: [],
    last_practiced_on: "2026-07-20",
    streak_days: 1,
  };
  const snapshot = await fixture.request("/api/v1/me/snapshot", {
    method: "PUT",
    cookie: student_cookie,
    body: {
      base_revision: 0,
      merge_local: true,
      progress,
      preferences: {
        sidebar_collapsed: false,
        free_practice: true,
        show_fingerings: true,
        audio_input_enabled: false,
        audio_calibration_midi: 60,
        audio_tuning_offset_cents: 0,
        calibration_field_order: ["staff", "pitch_name", "duration"],
        calibration_primary_fields: ["staff", "pitch_name"],
      },
    },
  });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.data.snapshot.revision, 1);
  assert.deepEqual(
    snapshot.data.snapshot.preferences.calibration_field_order.slice(0, 3),
    ["staff", "pitch_name", "duration"],
  );
  assert.deepEqual(
    snapshot.data.snapshot.preferences.calibration_primary_fields,
    ["staff", "pitch_name"],
  );
  assert.deepEqual(snapshot.data.snapshot.progress.completed_lesson_ids, [
    "w1-d1-technique",
  ]);

  const stale_snapshot = await fixture.request("/api/v1/me/snapshot", {
    method: "PUT",
    cookie: student_cookie,
    body: {
      base_revision: 0,
      merge_local: false,
      progress,
      preferences: snapshot.data.snapshot.preferences,
    },
  });
  assert.equal(stale_snapshot.status, 409);
  assert.equal(stale_snapshot.data.snapshot.revision, 1);

  const practice = await fixture.request("/api/v1/practice-sessions", {
    method: "POST",
    cookie: student_cookie,
    body: {
      lesson_id: "w1-d1-technique",
      input_source: "midi",
      started_at: 1_000,
      completed_at: 2_000,
      duration_ms: 1_000,
      bpm: 52,
      last_measure_index: 2,
      accuracy: 0.95,
      rhythm_accuracy: 0.9,
      mistakes: 1,
      early_steps: 0,
      late_steps: 1,
      metrics: { total_steps: 8, correct_steps: 7, max_combo: 6 },
    },
  });
  assert.equal(practice.status, 201);
  const duplicate_practice = await fixture.request("/api/v1/practice-sessions", {
    method: "POST",
    cookie: student_cookie,
    body: {
      lesson_id: "w1-d1-technique",
      input_source: "midi",
      started_at: 1_000,
      completed_at: 2_000,
      duration_ms: 1_000,
      bpm: 52,
      accuracy: 0.95,
      mistakes: 1,
      early_steps: 0,
      late_steps: 1,
      metrics: {},
    },
  });
  assert.equal(duplicate_practice.data.practice_session.id, practice.data.practice_session.id);

  const summary = await fixture.request("/api/v1/practice-sessions/summary", {
    cookie: student_cookie,
  });
  assert.equal(summary.status, 200);
  assert.equal(summary.data.summary.practice_count, 1);
  assert.equal(summary.data.summary.total_duration_ms, 1_000);
  assert.equal(summary.data.summary.input_sources[0].input_source, "midi");

  const exported = await fixture.request("/api/v1/me/export", {
    cookie: student_cookie,
  });
  assert.equal(exported.status, 200);
  assert.equal(exported.data.user.email, "student@example.com");
  assert.equal(exported.data.practice_sessions.length, 1);

  const disposable = await fixture.request("/api/v1/auth/register", {
    method: "POST",
    body: {
      email: "delete-me@example.com",
      display_name: "待删除账号",
      password: "delete-account-password",
      role: "student",
    },
  });
  const wrong_delete = await fixture.request("/api/v1/me", {
    method: "DELETE",
    cookie: disposable.cookie,
    body: { password: "wrong-password" },
  });
  assert.equal(wrong_delete.status, 401);
  const deleted = await fixture.request("/api/v1/me", {
    method: "DELETE",
    cookie: disposable.cookie,
    body: { password: "delete-account-password" },
  });
  assert.equal(deleted.status, 200);
  const deleted_me = await fixture.request("/api/v1/auth/me", {
    cookie: disposable.cookie,
  });
  assert.equal(deleted_me.status, 401);

  const forbidden_content = await fixture.request("/api/v1/admin/content", {
    method: "POST",
    cookie: student_cookie,
    body: {
      kind: "piece",
      title: "无权创建",
      metadata: {},
    },
  });
  assert.equal(forbidden_content.status, 403);

  const admin_password = await hash_password("administrator-password");
  fixture.repository.create_user({
    email: "admin@example.com",
    display_name: "内容管理员",
    role: "admin",
    ...admin_password,
  });
  const admin_login = await fixture.request("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: "admin@example.com",
      password: "administrator-password",
    },
  });
  assert.equal(admin_login.status, 200);
  const admin_cookie = admin_login.cookie;

  const active_curriculum = await fixture.request("/api/v1/curriculums/active");
  assert.equal(active_curriculum.status, 200);
  assert.equal(active_curriculum.data.curriculum.revision.version_number, 1);
  assert.equal(active_curriculum.data.curriculum.nodes.length, 690);

  const admin_curriculum = await fixture.request("/api/v1/admin/curriculums/active/nodes", {
    cookie: admin_cookie,
  });
  assert.equal(admin_curriculum.status, 200);
  const moved_node = await fixture.request("/api/v1/admin/curriculum-nodes/stage-1/move", {
    method: "PATCH",
    cookie: admin_cookie,
    body: { position: 9 },
  });
  assert.equal(moved_node.status, 200);
  assert.equal(moved_node.data.node.position, 9);
  const archived_node = await fixture.request(
    "/api/v1/admin/curriculum-nodes/lesson-w1-d1-warmup/archive",
    {
      method: "PATCH",
      cookie: admin_cookie,
      body: {},
    },
  );
  assert.equal(archived_node.status, 200);
  assert.equal(archived_node.data.node.status, "archived");

  const scores = await fixture.request("/api/v1/admin/scores", {
    cookie: admin_cookie,
  });
  assert.equal(scores.status, 200);
  assert.equal(scores.data.scores[0].id, "score-demo-c-major");
  assert.equal(scores.data.scores[0].versions[0].document.schema_version, 2);
  assert.equal(scores.data.scores[0].versions[0].document.provenance.kind, "manual");
  const draft_response = await fixture.request("/api/v1/admin/scores/score-demo-c-major/drafts", {
    method: "POST",
    cookie: admin_cookie,
    body: {},
  });
  assert.equal(draft_response.status, 201);
  assert.equal(draft_response.data.draft.document.schema_version, 2);
  assert.equal(draft_response.data.draft.document.status, "needs_review");
  const draft_id = draft_response.data.draft.id;
  const edited_draft = await fixture.request(
    `/api/v1/admin/score-drafts/${draft_id}/events/e1`,
    {
      method: "PATCH",
      cookie: admin_cookie,
      body: {
        note_id: "n1",
        midi: 64,
        finger: 3,
        onset_beats: 0,
        duration_beats: 1,
        hand: "right",
      },
    },
  );
  assert.equal(edited_draft.status, 200);
  assert.equal(edited_draft.data.draft.document.measures[0].events[0].notes[0].midi, 64);
  assert.equal(edited_draft.data.draft.document.measures[0].events[0].notes[0].finger, 3);
  assert.equal(
    edited_draft.data.draft.document.measures[0].events[0].notes[0].fingering.source,
    "manual",
  );
  const published_score = await fixture.request(
    `/api/v1/admin/score-drafts/${draft_id}/publish`,
    {
      method: "POST",
      cookie: admin_cookie,
      body: {},
    },
  );
  assert.equal(published_score.status, 200);
  assert.equal(published_score.data.version.version_number, 2);
  assert.equal(published_score.data.version.document.status, "published");
  assert.equal(
    published_score.data.version.document.review.published_by,
    admin_login.data.user.id,
  );

  const calibration_response = await fixture.request("/api/v1/admin/calibrations", {
    method: "POST",
    cookie: admin_cookie,
    body: {
      project: create_calibration_project_payload(),
      validation: {
        ok: false,
        by_level: {
          L0: { errors: 0, warnings: 0 },
          L1: { errors: 0, warnings: 0 },
          L2: { errors: 1, warnings: 0 },
          L3: { errors: 0, warnings: 1 },
        },
      },
    },
  });
  assert.equal(calibration_response.status, 200);
  assert.equal(calibration_response.data.original_sync.sync_state, "synced");
  assert.match(calibration_response.data.original_sync.original_data_sha256, /^[a-f0-9]{64}$/);
  assert.match(calibration_response.data.original_sync.musicxml_sha256, /^[a-f0-9]{64}$/);
  const synced_jianpu = JSON.parse(readFileSync(
    resolve(fixture.root, "jianpu", "beyer", "034.json"),
    "utf8",
  ));
  assert.deepEqual(synced_jianpu.measures[0].events[0].right_fingerings, [{
    note: 74,
    finger: 1,
    source: "score",
  }]);
  const synced_musicxml = readFileSync(
    resolve(fixture.root, "beyer", "034.musicxml"),
    "utf8",
  );
  assert.match(synced_musicxml, /<score-partwise version="4\.0">/);
  assert.match(synced_musicxml, /<step>D<\/step>/);
  assert.match(synced_musicxml, /<staff>1<\/staff>/);
  assert.match(synced_musicxml, /<staff>2<\/staff>/);
  assert.match(synced_musicxml, /<backup>\s*<duration>32<\/duration>\s*<\/backup>/);
  assert.match(synced_musicxml, /<fingering>1<\/fingering>/);
  const saved_calibration = fixture.repository.get_score_calibration(
    "material:beyer:beyer.segment.034",
  );
  assert.equal(saved_calibration.material_id, "beyer");
  assert.equal(saved_calibration.segment_id, "beyer.segment.034");
  assert.equal(saved_calibration.document.status, "published");
  assert.equal(saved_calibration.document.review.published_by, admin_login.data.user.id);
  assert.equal(saved_calibration.document.measures[0].events[0].notes[0].midi, 74);
  assert.equal(
    saved_calibration.document.measures[0].events[0].notes[0].fingering.status,
    "published",
  );
  const rewritten_jianpu = JSON.parse(
    readFileSync(resolve(fixture.root, "jianpu", "beyer", "034.json"), "utf8"),
  );
  assert.deepEqual(rewritten_jianpu.measures[0].events[0].right_notes, [74]);
  assert.deepEqual(rewritten_jianpu.measures[0].events[0].left_notes, [55]);
  const rewritten_jianpu_catalog = JSON.parse(
    readFileSync(resolve(fixture.root, "jianpu-catalog.json"), "utf8"),
  );
  assert.equal(
    rewritten_jianpu_catalog.materials[0].chapters[0].title,
    "校准后的章节名",
  );
  assert.equal(
    rewritten_jianpu_catalog.materials[0].segments[0].page_slices[0].chapter_title,
    "校准后的章节名",
  );
  assert.equal(
    rewritten_jianpu_catalog.materials[0].segments[0].title,
    "校准后的片段名",
  );
  assert.equal(
    rewritten_jianpu_catalog.materials[0].segments[0].page_slices[0].title,
    "校准后的片段名",
  );
  const rewritten_material_catalog = JSON.parse(
    readFileSync(resolve(fixture.root, "catalog.json"), "utf8"),
  );
  assert.equal(
    rewritten_material_catalog.materials[0].segments[0].title,
    "校准后的片段名",
  );
  const material_catalog_response = await fixture.request("/api/v1/content/materials");
  assert.equal(material_catalog_response.status, 200);
  assert.equal(
    material_catalog_response.data.materials[0].segments[0].title,
    "校准后的片段名",
  );
  const jianpu_catalog_response = await fixture.request("/api/v1/content/jianpu-materials");
  assert.equal(jianpu_catalog_response.status, 200);
  assert.equal(
    jianpu_catalog_response.data.materials[0].segments[0].title,
    "校准后的片段名",
  );

  const deleted_material = await fixture.request(
    "/api/v1/admin/materials/beyer/segments/beyer.segment.034",
    {
      method: "DELETE",
      cookie: admin_cookie,
      body: {},
    },
  );
  assert.equal(deleted_material.status, 200);
  assert.equal(deleted_material.data.material_deletion.deletion_status, "deleted");
  assert.equal(deleted_material.data.material_deletion.material_id, "beyer");
  assert.equal(deleted_material.data.material_deletion.segment_id, "beyer.segment.034");
  assert.equal(fixture.repository.list_material_deletions().length, 1);

  const material_catalog_after_delete = await fixture.request("/api/v1/content/materials");
  assert.equal(material_catalog_after_delete.status, 200);
  assert.equal(material_catalog_after_delete.data.materials.length, 0);
  const jianpu_catalog_after_delete = await fixture.request("/api/v1/content/jianpu-materials");
  assert.equal(jianpu_catalog_after_delete.status, 200);
  assert.equal(jianpu_catalog_after_delete.data.materials.length, 0);

  const created = await fixture.request("/api/v1/admin/content", {
    method: "POST",
    cookie: admin_cookie,
    body: {
      kind: "piece",
      title: "测试练习曲",
      metadata: {
        difficulty: "入门",
        key_signature: "C 大调",
        time_signature: "4/4",
        hand_mode: "right",
        learning_goal: "稳定读谱",
      },
    },
  });
  assert.equal(created.status, 201);
  const content_id = created.data.content.id;

  const first_musicxml = create_musicxml("第一版");
  const first_version = await upload_version(
    fixture,
    admin_cookie,
    content_id,
    first_musicxml,
  );
  assert.equal(first_version.status, 201);
  assert.equal(first_version.data.version.version_number, 1);

  const first_publish = await fixture.request(
    `/api/v1/admin/content/${content_id}/publish`,
    {
      method: "POST",
      cookie: admin_cookie,
      body: { version_id: first_version.data.version.id },
    },
  );
  assert.equal(first_publish.status, 200);

  const second_musicxml = create_musicxml("第二版");
  const second_version = await upload_version(
    fixture,
    admin_cookie,
    content_id,
    second_musicxml,
  );
  assert.equal(second_version.data.version.version_number, 2);
  const admin_content_before_publish = await fixture.request("/api/v1/admin/content", {
    cookie: admin_cookie,
  });
  assert.equal(admin_content_before_publish.data.content[0].versions.length, 2);
  const public_content_before_publish = await fixture.request(`/api/v1/content/${content_id}`);
  assert.equal(public_content_before_publish.data.content.versions.length, 1);
  const second_publish = await fixture.request(
    `/api/v1/admin/content/${content_id}/publish`,
    {
      method: "POST",
      cookie: admin_cookie,
      body: { version_id: second_version.data.version.id },
    },
  );
  assert.equal(second_publish.status, 200);
  assert.equal(second_publish.data.content.current_version_id, second_version.data.version.id);

  const old_asset = await fixture.request(
    first_version.data.version.musicxml_url,
    { raw: true },
  );
  assert.equal(old_asset.status, 200);
  assert.equal(old_asset.text, first_musicxml);

  const public_content = await fixture.request(`/api/v1/content/${content_id}`);
  assert.equal(public_content.status, 200);
  assert.equal(public_content.data.content.versions.length, 2);
  assert.equal(public_content.data.content.versions[0].version_number, 2);

  const role_update = await fixture.request(
    `/api/v1/admin/users/${registration.data.user.id}/role`,
    {
      method: "PATCH",
      cookie: admin_cookie,
      body: { role: "teacher" },
    },
  );
  assert.equal(role_update.status, 200);
  assert.equal(role_update.data.user.role, "teacher");

  const invalid_admin_grant = await fixture.request(
    `/api/v1/admin/users/${registration.data.user.id}/role`,
    {
      method: "PATCH",
      cookie: admin_cookie,
      body: { role: "admin" },
    },
  );
  assert.equal(invalid_admin_grant.status, 400);
});

async function upload_version(fixture, cookie, content_id, musicxml_text) {
  const source_sha256 = createHash("sha256").update(musicxml_text).digest("hex");
  return fixture.request(`/api/v1/admin/content/${content_id}/versions`, {
    method: "POST",
    cookie,
    body: {
      musicxml_text,
      practice_data: {
        schema_version: "1.0",
        source_sha256,
        events: [{ id: "event-1", notes: [60] }],
      },
    },
  });
}

function create_musicxml(title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>4</duration></note></measure></part>
</score-partwise>`;
}

function create_calibration_project_payload() {
  const document = {
    schema_version: 2,
    id: "material:beyer:beyer.segment.034",
    number: null,
    title: "校准后的片段名",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "2/4",
    status: "needs_review",
    provenance: {
      kind: "manual",
      source_id: "beyer.segment.034",
      source_file: "/materials/jianpu/beyer/034.json",
      source_sha256: null,
      font_config_version: null,
      importer_version: "calibration-test",
      references: [],
    },
    measures: [{
      id: "m1",
      number: "1",
      meter: { beats: 2, beat_unit: 4 },
      events: [{
        id: "e1",
        onset_beats: 0,
        duration_beats: 2,
        hand: "right",
        voice: 1,
        notes: [{
          id: "n1",
          midi: 74,
          finger: 1,
          fingering: {
            source: "manual",
            status: "needs_review",
            reason: "校准台当前事件面板设置指法。",
            confirmed_by: null,
            confirmed_at: null,
            source_refs: [],
          },
          source_refs: [],
        }],
        source_refs: [],
      }, {
        id: "e2",
        onset_beats: 0,
        duration_beats: 2,
        hand: "left",
        voice: 2,
        notes: [{ id: "n2", midi: 55, source_refs: [] }],
        source_refs: [],
      }],
    }],
    lyrics: [],
    hand_positions: [],
    review: {
      reviewed_by: null,
      reviewed_at: null,
      published_by: null,
      published_at: null,
      note: "校准测试",
    },
  };
  return {
    schema_version: 1,
    id: "material:beyer:beyer.segment.034",
    title: "校准后的片段名",
    work: {
      composer: "",
      title: "校准后的片段名",
      opus: "",
      edition: "拜厄钢琴基本教程",
      publisher: "",
      source: "原谱第 25 页",
    },
    source: {
      kind: "existing",
      file_name: "/materials/jianpu/beyer/034.json",
      page_count: 1,
      attached_at: new Date("2026-08-25T00:00:00.000Z").toISOString(),
    },
    material_catalog: {
      material_id: "beyer",
      title: "拜厄钢琴基本教程",
      chapters: [{
        id: "chapter-1",
        title: "校准后的章节名",
        description: "",
        page_start: 25,
        page_end: 25,
      }],
    },
    musicxml: null,
    document,
    event_metadata: {
      e1: {
        event_id: "e1",
        staff: 1,
        hand: "right",
        clef: "treble",
        articulation: "",
        dynamics: "",
        slur: "none",
        source_page: 25,
        source_system: 1,
      },
      e2: {
        event_id: "e2",
        staff: 2,
        hand: "left",
        clef: "bass",
        articulation: "",
        dynamics: "",
        slur: "none",
        source_page: 25,
        source_system: 1,
      },
    },
    levels: {
      L0: { status: "passed", confirmed_at: "2026-08-25T00:00:00.000Z" },
      L1: { status: "passed", confirmed_at: "2026-08-25T00:00:00.000Z" },
      L2: { status: "in_progress", confirmed_at: null },
      L3: { status: "in_progress", confirmed_at: null },
    },
    updated_at: "2026-08-25T00:00:00.000Z",
  };
}

async function create_fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "panio-backend-"));
  const static_root = resolve(root, "dist");
  const uploads_root = resolve(root, "content");
  const catalog_path = resolve(root, "catalog.json");
  mkdirSync(static_root, { recursive: true });
  mkdirSync(resolve(root, "jianpu", "beyer"), { recursive: true });
  writeFileSync(resolve(static_root, "index.html"), "<main>Panio</main>");
  writeFileSync(catalog_path, JSON.stringify({
    schema_version: "1.0",
    generated_at: "2026-07-20",
    review_only: false,
    notice: "",
    materials: [{
      id: "beyer",
      title: "拜厄钢琴基本教程",
      page_count: 120,
      segment_count: 1,
      segments: [{
        id: "beyer.segment.034",
        material_id: "beyer",
        sequence: 34,
        title: "测试片段",
        source_pages: [25],
        source_page_label: "PDF 第 25 页",
        ocr_labels: [],
        ocr_exercise_numbers: [],
        xml_version: "fixture",
        part_count: 1,
        measure_count: 1,
        time_signatures: ["2/4"],
        musicxml_url: "/materials/beyer/034.musicxml",
        sha256: "fixture-sha",
        source_status: "candidate",
        status: "needs_review",
        realtime_judgement_allowed: false,
        mapping_confidence: "source_page",
      }],
    }],
  }));
  writeFileSync(resolve(root, "jianpu-catalog.json"), JSON.stringify({
    schema_version: "1.0",
    generated_at: "2026-08-25",
    materials: [{
      id: "beyer",
      title: "拜厄钢琴基本教程",
      chapters: [{
        id: "chapter-1",
        title: "原章节名",
        description: "",
        page_start: 25,
        page_end: 25,
      }],
      segments: [{
        id: "beyer.segment.034",
        title: "测试片段",
        jianpu_url: "/materials/jianpu/beyer/034.json",
        musicxml_url: "/materials/beyer/034.musicxml",
        page_slices: [{
          source_pages: [25],
          title: "测试片段",
          text: "",
          measure_start: 1,
          measure_end: 1,
          chapter_id: "chapter-1",
          chapter_title: "原章节名",
          mapping: "verified",
        }],
      }],
    }],
  }));
  writeFileSync(resolve(root, "jianpu", "beyer", "034.json"), JSON.stringify({
    schema_version: "1.0",
    segment_id: "beyer.segment.034",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "2/4",
    measures: [{
      index: 1,
      number: "1",
      directions: [],
      events: [{
        onset_beats: 0,
        duration_beats: 2,
        right_notes: [72],
        left_notes: [60],
        chord: null,
      }],
    }],
  }));
  mkdirSync(resolve(root, "beyer"), { recursive: true });
  writeFileSync(resolve(root, "beyer", "034.musicxml"), create_musicxml("测试片段"));

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
    root,
    repository,
    async request(path, {
      method = "GET",
      body,
      cookie,
      raw = false,
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
      const result = {
        status: response.status,
        set_cookie,
        cookie: set_cookie.split(";", 1)[0],
      };
      if (raw) {
        result.text = await response.text();
      } else {
        result.data = await response.json();
      }
      return result;
    },
    async close() {
      await new Promise((resolve_close) => server.close(resolve_close));
      repository.close();
      rmSync(root, { force: true, recursive: true });
    },
  };
}
