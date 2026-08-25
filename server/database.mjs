import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { migrate_score_document } from "../src/features/score/migration-runtime.mjs";
import { validate_score_document } from "./validation.mjs";

export class score_publish_error extends Error {
  constructor(reasons) {
    super(reasons.join("；"));
    this.name = "score_publish_error";
    this.code = "score_publish_blocked";
    this.reasons = reasons;
  }
}

const empty_progress = Object.freeze({
  schema_version: 2,
  current_phase_id: "hand-foundation",
  current_week_number: 1,
  current_day_index: 1,
  completed_lesson_ids: [],
  results_by_lesson: {},
  weak_lesson_ids: [],
  streak_days: 0,
});
const empty_preferences = Object.freeze({
  sidebar_collapsed: false,
  free_practice: true,
  show_fingerings: true,
  audio_input_enabled: false,
  audio_calibration_midi: 60,
  audio_tuning_offset_cents: 0,
  calibration_field_order: [
    "pitch_name",
    "duration",
    "fingering",
    "hand",
    "measure_number",
    "measure_beats",
    "measure_beat_unit",
    "beat_position",
    "voice",
    "staff",
    "clef",
    "accidental",
    "source_page",
    "source_system",
    "chord",
    "rest",
    "tie",
    "slur",
    "articulation",
    "dynamics",
    "tempo",
    "repeat",
    "pitch_midi",
  ],
  calibration_primary_fields: [
    "pitch_name",
    "duration",
    "fingering",
    "hand",
  ],
});

export function open_database(database_path = resolve("data/panio.sqlite")) {
  if (database_path !== ":memory:") {
    mkdirSync(dirname(database_path), { recursive: true, mode: 0o700 });
  }

  const database = new DatabaseSync(database_path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  if (database_path !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
    try {
      chmodSync(database_path, 0o600);
    } catch {
      // The file can be opened before its final permissions are available on some filesystems.
    }
  }
  migrate(database);
  return create_repository(database);
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const current_version = Number(
    database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get().version,
  );
  if (current_version < 1) {
    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'teacher', 'admin')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE user_snapshots (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 0,
        progress_json TEXT NOT NULL,
        preferences_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE content_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('material', 'course', 'exercise', 'piece')),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        metadata_json TEXT NOT NULL,
        current_version_id TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE content_versions (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        musicxml_path TEXT NOT NULL,
        practice_data_path TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        UNIQUE(content_id, version_number)
      );

      CREATE TABLE practice_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_result_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        content_version_id TEXT REFERENCES content_versions(id),
        input_source TEXT NOT NULL CHECK (
          input_source IN ('midi', 'keyboard', 'microphone', 'virtual_piano', 'manual')
        ),
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        bpm INTEGER,
        last_measure_index INTEGER,
        accuracy REAL NOT NULL,
        rhythm_accuracy REAL,
        mistakes INTEGER NOT NULL,
        early_steps INTEGER NOT NULL,
        late_steps INTEGER NOT NULL,
        metrics_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, client_result_id)
      );

      CREATE TABLE material_reviews (
        segment_id TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        checks_json TEXT NOT NULL,
        note TEXT NOT NULL,
        reviewer_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(segment_id, content_sha256)
      );

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
      CREATE INDEX practice_sessions_user_time_idx
        ON practice_sessions(user_id, completed_at DESC);
      CREATE INDEX practice_sessions_user_lesson_idx
        ON practice_sessions(user_id, lesson_id);
      CREATE INDEX content_items_kind_status_idx ON content_items(kind, status);
      CREATE INDEX content_versions_content_idx
        ON content_versions(content_id, version_number DESC);
      CREATE INDEX audit_events_created_at_idx ON audit_events(created_at DESC);
    `);
      database.prepare(
        "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
      ).run(1, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  if (current_version < 2) {
    migrate_curriculum_and_score_editor(database);
  }
  if (current_version < 3) {
    migrate_score_document_storage(database);
  }
  if (current_version < 4) {
    migrate_hymn_review_workflow(database);
  }
  if (current_version < 5) {
    migrate_curriculum_binding_integrity(database);
  }
  if (current_version < 6) {
    migrate_score_calibration_storage(database);
  }
  if (current_version < 7) {
    migrate_material_deletion_storage(database);
  }
}

function migrate_score_document_storage(database) {
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      ALTER TABLE score_versions
        ADD COLUMN document_schema_version INTEGER NOT NULL DEFAULT 1
        CHECK (document_schema_version IN (1, 2));
      ALTER TABLE score_drafts
        ADD COLUMN document_schema_version INTEGER NOT NULL DEFAULT 1
        CHECK (document_schema_version IN (1, 2));
    `);
    for (const table of ["score_versions", "score_drafts"]) {
      const rows = database.prepare(`SELECT id, document_json FROM ${table}`).all();
      const update = database.prepare(`
        UPDATE ${table} SET document_schema_version = ? WHERE id = ?
      `);
      for (const row of rows) {
        update.run(read_score_document_schema_version(row.document_json), row.id);
      }
    }
    database.prepare(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(3, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migrate_hymn_review_workflow(database) {
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      ALTER TABLE score_versions ADD COLUMN hymn_review_json TEXT;
      ALTER TABLE score_drafts ADD COLUMN hymn_review_json TEXT;

      DROP INDEX IF EXISTS score_edit_events_draft_idx;
      ALTER TABLE score_edit_events RENAME TO score_edit_events_legacy;
      CREATE TABLE score_edit_events (
        id TEXT PRIMARY KEY,
        draft_id TEXT REFERENCES score_drafts(id) ON DELETE SET NULL,
        score_version_id TEXT REFERENCES score_versions(id) ON DELETE RESTRICT,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        command_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (draft_id IS NOT NULL OR score_version_id IS NOT NULL)
      );
      INSERT INTO score_edit_events(
        id, draft_id, score_version_id, actor_user_id, command_json, created_at
      )
      SELECT id, draft_id, NULL, actor_user_id, command_json, created_at
      FROM score_edit_events_legacy;
      DROP TABLE score_edit_events_legacy;

      CREATE INDEX score_edit_events_draft_idx
        ON score_edit_events(draft_id, created_at DESC);
      CREATE INDEX score_edit_events_version_idx
        ON score_edit_events(score_version_id, created_at DESC);
    `);
    database.prepare(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(4, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migrate_score_calibration_storage(database) {
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS score_calibrations (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        project_json TEXT NOT NULL,
        document_json TEXT NOT NULL,
        event_metadata_json TEXT NOT NULL,
        validation_json TEXT NOT NULL,
        original_data_path TEXT,
        original_data_sha256 TEXT,
        sync_state TEXT NOT NULL CHECK (sync_state IN ('synced', 'skipped')),
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(material_id, segment_id)
      );

      CREATE INDEX IF NOT EXISTS score_calibrations_material_idx
        ON score_calibrations(material_id, segment_id);
    `);
    database.prepare(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(6, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migrate_material_deletion_storage(database) {
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS material_deletions (
        material_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        deletion_status TEXT NOT NULL DEFAULT 'deleted'
          CHECK (deletion_status IN ('deleted')),
        deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        deleted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(material_id, segment_id)
      );

      CREATE INDEX IF NOT EXISTS material_deletions_status_idx
        ON material_deletions(deletion_status, material_id, segment_id);
    `);
    database.prepare(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(7, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migrate_curriculum_binding_integrity(database) {
  const now = new Date().toISOString();
  const orphan = database.prepare(`
    SELECT lesson_score_bindings.id
    FROM lesson_score_bindings
    LEFT JOIN score_versions
      ON score_versions.id = lesson_score_bindings.score_version_id
    WHERE score_versions.id IS NULL
    LIMIT 1
  `).get();
  if (orphan) {
    throw new Error(
      `课程乐谱绑定 ${orphan.id} 引用了不存在的乐谱版本。`,
    );
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TRIGGER lesson_score_bindings_score_version_insert
      BEFORE INSERT ON lesson_score_bindings
      WHEN NOT EXISTS (
        SELECT 1 FROM score_versions WHERE id = NEW.score_version_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'lesson score version does not exist');
      END;

      CREATE TRIGGER lesson_score_bindings_score_version_update
      BEFORE UPDATE OF score_version_id ON lesson_score_bindings
      WHEN NOT EXISTS (
        SELECT 1 FROM score_versions WHERE id = NEW.score_version_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'lesson score version does not exist');
      END;

      CREATE TRIGGER score_versions_bound_delete_restrict
      BEFORE DELETE ON score_versions
      WHEN EXISTS (
        SELECT 1 FROM lesson_score_bindings
        WHERE score_version_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'score version is bound to a lesson');
      END;
    `);
    database.prepare(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(5, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function read_score_document_schema_version(document_json) {
  try {
    return JSON.parse(document_json).schema_version === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

function migrate_curriculum_and_score_editor(database) {
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS curriculums (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        active_revision_id TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS curriculum_revisions (
        id TEXT PRIMARY KEY,
        curriculum_id TEXT NOT NULL REFERENCES curriculums(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        UNIQUE(curriculum_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS curriculum_nodes (
        id TEXT PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES curriculum_revisions(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('stage', 'week', 'practice_day', 'lesson')),
        title TEXT NOT NULL,
        position INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lesson_score_bindings (
        id TEXT PRIMARY KEY,
        lesson_node_id TEXT NOT NULL REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
        score_version_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('primary', 'reference', 'practice_events')),
        position INTEGER NOT NULL,
        settings_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        metadata_json TEXT NOT NULL,
        current_version_id TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS score_versions (
        id TEXT PRIMARY KEY,
        score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        document_json TEXT NOT NULL,
        musicxml_path TEXT,
        practice_data_path TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        UNIQUE(score_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS score_drafts (
        id TEXT PRIMARY KEY,
        score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
        base_version_id TEXT REFERENCES score_versions(id) ON DELETE SET NULL,
        document_json TEXT NOT NULL,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS score_edit_events (
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES score_drafts(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        command_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS curriculum_nodes_revision_idx
        ON curriculum_nodes(revision_id, parent_id, position);
      CREATE INDEX IF NOT EXISTS curriculum_nodes_status_idx
        ON curriculum_nodes(status);
      CREATE INDEX IF NOT EXISTS score_versions_score_idx
        ON score_versions(score_id, version_number DESC);
      CREATE INDEX IF NOT EXISTS score_drafts_score_idx
        ON score_drafts(score_id);
      CREATE INDEX IF NOT EXISTS score_edit_events_draft_idx
        ON score_edit_events(draft_id, created_at DESC);
    `);
    seed_default_curriculum(database, now);
    seed_default_score(database, now);
    database.prepare(
      "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(2, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function seed_default_curriculum(database, now) {
  const exists = database.prepare("SELECT 1 AS ok FROM curriculums WHERE id = ?")
    .get("default-36-week");
  if (exists) {
    return;
  }

  const curriculum_id = "default-36-week";
  const revision_id = "default-36-week-rev-1";
  database.prepare(`
    INSERT INTO curriculums(
      id, slug, title, status, active_revision_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'published', ?, NULL, ?, ?)
  `).run(curriculum_id, "default-36-week", "练琴簿 36 周课程", revision_id, now, now);
  database.prepare(`
    INSERT INTO curriculum_revisions(
      id, curriculum_id, version_number, status, title, description,
      created_by, created_at, published_at
    ) VALUES (?, ?, 1, 'published', ?, ?, NULL, ?, ?)
  `).run(
    revision_id,
    curriculum_id,
    "默认 36 周课程",
    "由静态课程迁移前的数据库课程骨架生成，可在后台调整顺序和归档节点。",
    now,
    now,
  );

  const insert_node = database.prepare(`
    INSERT INTO curriculum_nodes(
      id, revision_id, parent_id, kind, title, position, payload_json,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);
  const stage_titles = [
    "一、小汤 1 入门",
    "二、小汤 2 基础双手",
    "三、拜厄入门衔接",
    "四、调性扩展与移动把位",
    "五、简谱直接双手弹奏",
    "六、稳定性与完整演奏",
  ];
  const lesson_types = [
    ["warmup", "热身与手型", 5],
    ["method", "方法教材", 20],
    ["technique", "技术", 10],
    ["repertoire", "曲目", 15],
    ["sight_reading", "简谱视奏", 10],
  ];

  for (let stage_index = 0; stage_index < stage_titles.length; stage_index += 1) {
    const stage_number = stage_index + 1;
    const week_start = [1, 5, 9, 13, 21, 29][stage_index];
    const week_end = [4, 8, 12, 20, 28, 36][stage_index];
    const stage_id = `stage-${stage_number}`;
    insert_node.run(
      stage_id,
      revision_id,
      null,
      "stage",
      stage_titles[stage_index],
      stage_number,
      JSON.stringify({ week_start, week_end }),
      now,
      now,
    );
    for (let week = week_start; week <= week_end; week += 1) {
      const week_id = `week-${week}`;
      insert_node.run(
        week_id,
        revision_id,
        stage_id,
        "week",
        `第 ${week} 周`,
        week,
        JSON.stringify({ week_number: week }),
        now,
        now,
      );
      for (let day = 1; day <= 3; day += 1) {
        const day_id = `day-w${week}-d${day}`;
        insert_node.run(
          day_id,
          revision_id,
          week_id,
          "practice_day",
          `第 ${week} 周第 ${day} 次`,
          day,
          JSON.stringify({ week_number: week, day_index: day, time_budget_minutes: 60 }),
          now,
          now,
        );
        lesson_types.forEach(([exercise_type, title, estimated_minutes], lesson_index) => {
          insert_node.run(
            `lesson-w${week}-d${day}-${exercise_type}`,
            revision_id,
            day_id,
            "lesson",
            title,
            lesson_index + 1,
            JSON.stringify({ exercise_type, estimated_minutes }),
            now,
            now,
          );
        });
      }
    }
  }
}

function seed_default_score(database, now) {
  const exists = database.prepare("SELECT 1 AS ok FROM scores WHERE id = ?")
    .get("score-demo-c-major");
  if (exists) {
    return;
  }

  const document = create_default_score_document({
    status: "published",
    published_by: "system",
    published_at: now,
  });
  const serialized = JSON.stringify(document);
  const sha = createHash("sha256").update(serialized).digest("hex");
  const version_id = "score-demo-c-major-v1";
  database.prepare(`
    INSERT INTO scores(
      id, slug, title, status, metadata_json, current_version_id,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'published', ?, ?, NULL, ?, ?)
  `).run(
    "score-demo-c-major",
    "demo-c-major",
    "C 大调示例校对谱",
    JSON.stringify({ key_signature: "C 大调（1 = C）", time_signature: "4/4" }),
    version_id,
    now,
    now,
  );
  database.prepare(`
    INSERT INTO score_versions(
      id, score_id, version_number, source_sha256, document_json,
      musicxml_path, practice_data_path, created_by, created_at, published_at
    ) VALUES (?, ?, 1, ?, ?, NULL, NULL, NULL, ?, ?)
  `).run(version_id, "score-demo-c-major", sha, serialized, now, now);
}

function create_default_score_document({
  status = "candidate",
  published_by = null,
  published_at = null,
} = {}) {
  const annotation = (reason) => ({
    source: "manual",
    status: published_by ? "confirmed" : "candidate",
    reason,
    confirmed_by: published_by,
    confirmed_at: published_at,
    source_refs: [],
  });
  return {
    schema_version: 2,
    id: "score-demo-c-major",
    number: null,
    title: "C 大调示例校对谱",
    key_signature: "C 大调（1 = C）",
    tonic_midi: 60,
    time_signature: "4/4",
    status,
    provenance: {
      kind: "manual",
      source_id: null,
      source_file: null,
      source_sha256: null,
      font_config_version: null,
      importer_version: null,
      references: [],
    },
    lyrics: [],
    hand_positions: [],
    measures: [{
      id: "m1",
      number: "1",
      meter: { beats: 4, beat_unit: 4 },
      events: [
        {
          id: "e1",
          onset_beats: 0,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{
            id: "n1",
            midi: 60,
            finger: 1,
            fingering: annotation("Default teaching fingering"),
          }],
          chord: "C",
          chord_annotation: annotation("Default tonic chord"),
        },
        {
          id: "e2",
          onset_beats: 1,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{
            id: "n2",
            midi: 62,
            finger: 2,
            fingering: annotation("Default teaching fingering"),
          }],
        },
      ],
    }],
    review: {
      reviewed_by: published_by,
      reviewed_at: published_at,
      published_by,
      published_at,
      note: published_by ? "Default score seed" : null,
    },
  };
}

function create_repository(database) {
  return {
    raw: database,
    close() {
      database.close();
    },
    get_schema_version() {
      return Number(
        database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
          .get().version,
      );
    },
    get_active_curriculum() {
      const curriculum = database.prepare(`
        SELECT * FROM curriculums
        WHERE status = 'published' AND active_revision_id IS NOT NULL
        ORDER BY created_at ASC
        LIMIT 1
      `).get();
      if (!curriculum) {
        return undefined;
      }
      const revision = database.prepare(`
        SELECT * FROM curriculum_revisions
        WHERE id = ?
      `).get(curriculum.active_revision_id);
      if (!revision) {
        return undefined;
      }
      return {
        curriculum: normalize_curriculum(curriculum),
        revision: normalize_curriculum_revision(revision),
        nodes: this.list_curriculum_nodes(revision.id, false),
        bindings: this.list_lesson_score_bindings(revision.id),
        score_versions: this.list_bound_score_versions(revision.id),
      };
    },
    get_curriculum_revision(revision_id) {
      const row = database.prepare(`
        SELECT * FROM curriculum_revisions WHERE id = ?
      `).get(revision_id);
      return row ? normalize_curriculum_revision(row) : undefined;
    },
    create_curriculum_revision(user_id, curriculum_id, base_revision_id) {
      const curriculum = database.prepare(`
        SELECT * FROM curriculums WHERE id = ?
      `).get(curriculum_id);
      if (!curriculum) {
        return undefined;
      }
      const source_revision_id =
        base_revision_id ?? curriculum.active_revision_id;
      const source_revision = database.prepare(`
        SELECT * FROM curriculum_revisions
        WHERE id = ? AND curriculum_id = ?
      `).get(source_revision_id, curriculum_id);
      if (!source_revision) {
        return undefined;
      }
      const version_number = Number(database.prepare(`
        SELECT COALESCE(MAX(version_number), 0) + 1 AS value
        FROM curriculum_revisions WHERE curriculum_id = ?
      `).get(curriculum_id).value);
      const revision_id = randomUUID();
      const now = new Date().toISOString();
      const source_nodes = database.prepare(`
        SELECT * FROM curriculum_nodes
        WHERE revision_id = ?
        ORDER BY parent_id IS NOT NULL, parent_id, position, created_at
      `).all(source_revision_id);
      const node_ids = new Map(
        source_nodes.map((node) => [node.id, randomUUID()]),
      );

      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT INTO curriculum_revisions(
            id, curriculum_id, version_number, status, title, description,
            created_by, created_at, published_at
          ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, NULL)
        `).run(
          revision_id,
          curriculum_id,
          version_number,
          `${source_revision.title} · 修订 ${version_number}`,
          source_revision.description,
          user_id,
          now,
        );
        const insert_node = database.prepare(`
          INSERT INTO curriculum_nodes(
            id, revision_id, parent_id, kind, title, position, payload_json,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const pending_nodes = [...source_nodes];
        const inserted_source_ids = new Set();
        while (pending_nodes.length > 0) {
          const ready_index = pending_nodes.findIndex((node) =>
            !node.parent_id || inserted_source_ids.has(node.parent_id));
          if (ready_index < 0) {
            throw new Error("课程节点层级包含循环或缺失父节点。");
          }
          const [node] = pending_nodes.splice(ready_index, 1);
          insert_node.run(
            node_ids.get(node.id),
            revision_id,
            node.parent_id ? node_ids.get(node.parent_id) : null,
            node.kind,
            node.title,
            node.position,
            node.payload_json,
            node.status,
            now,
            now,
          );
          inserted_source_ids.add(node.id);
        }
        const source_bindings = database.prepare(`
          SELECT * FROM lesson_score_bindings
          WHERE lesson_node_id IN (
            SELECT id FROM curriculum_nodes WHERE revision_id = ?
          )
          ORDER BY position, id
        `).all(source_revision_id);
        const insert_binding = database.prepare(`
          INSERT INTO lesson_score_bindings(
            id, lesson_node_id, score_version_id, role, position, settings_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const binding of source_bindings) {
          insert_binding.run(
            randomUUID(),
            node_ids.get(binding.lesson_node_id),
            binding.score_version_id,
            binding.role,
            binding.position,
            binding.settings_json,
          );
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return {
        revision: this.get_curriculum_revision(revision_id),
        nodes: this.list_curriculum_nodes(revision_id, true),
        bindings: this.list_lesson_score_bindings(revision_id),
      };
    },
    list_lesson_score_bindings(revision_id) {
      return database.prepare(`
        SELECT lesson_score_bindings.*
        FROM lesson_score_bindings
        JOIN curriculum_nodes
          ON curriculum_nodes.id = lesson_score_bindings.lesson_node_id
        WHERE curriculum_nodes.revision_id = ?
        ORDER BY lesson_score_bindings.lesson_node_id,
          lesson_score_bindings.position, lesson_score_bindings.id
      `).all(revision_id).map(normalize_lesson_score_binding);
    },
    list_bound_score_versions(revision_id) {
      return database.prepare(`
        SELECT DISTINCT score_versions.*
        FROM score_versions
        JOIN scores ON scores.id = score_versions.score_id
        JOIN lesson_score_bindings
          ON lesson_score_bindings.score_version_id = score_versions.id
        JOIN curriculum_nodes
          ON curriculum_nodes.id = lesson_score_bindings.lesson_node_id
        WHERE curriculum_nodes.revision_id = ?
          AND score_versions.published_at IS NOT NULL
          AND scores.status = 'published'
        ORDER BY score_versions.score_id, score_versions.version_number
      `).all(revision_id).map(normalize_score_version);
    },
    upsert_lesson_score_binding(revision_id, lesson_node_id, input) {
      const revision = database.prepare(`
        SELECT * FROM curriculum_revisions
        WHERE id = ? AND status = 'draft'
      `).get(revision_id);
      const lesson = database.prepare(`
        SELECT * FROM curriculum_nodes
        WHERE id = ? AND revision_id = ? AND kind = 'lesson'
      `).get(lesson_node_id, revision_id);
      if (!revision || !lesson) {
        return undefined;
      }
      const version = database.prepare(`
        SELECT score_versions.*
        FROM score_versions
        JOIN scores ON scores.id = score_versions.score_id
        WHERE score_versions.id = ?
          AND score_versions.published_at IS NOT NULL
          AND scores.status = 'published'
      `).get(input.score_version_id);
      if (!version) {
        return { rejected: true, reason: "score_version_not_published" };
      }
      const existing = database.prepare(`
        SELECT id FROM lesson_score_bindings
        WHERE lesson_node_id = ? AND role = ? AND position = ?
      `).get(lesson_node_id, input.role, input.position);
      const id = existing?.id ?? randomUUID();
      database.prepare(`
        INSERT INTO lesson_score_bindings(
          id, lesson_node_id, score_version_id, role, position, settings_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          score_version_id = excluded.score_version_id,
          settings_json = excluded.settings_json
      `).run(
        id,
        lesson_node_id,
        input.score_version_id,
        input.role,
        input.position,
        JSON.stringify(input.settings),
      );
      return normalize_lesson_score_binding(database.prepare(`
        SELECT * FROM lesson_score_bindings WHERE id = ?
      `).get(id));
    },
    publish_curriculum_revision(user_id, revision_id) {
      const revision = database.prepare(`
        SELECT * FROM curriculum_revisions
        WHERE id = ? AND status = 'draft'
      `).get(revision_id);
      if (!revision) {
        return undefined;
      }
      const invalid_binding = database.prepare(`
        SELECT lesson_score_bindings.id
        FROM lesson_score_bindings
        JOIN curriculum_nodes
          ON curriculum_nodes.id = lesson_score_bindings.lesson_node_id
        LEFT JOIN score_versions
          ON score_versions.id = lesson_score_bindings.score_version_id
        LEFT JOIN scores ON scores.id = score_versions.score_id
        WHERE curriculum_nodes.revision_id = ?
          AND (
            score_versions.published_at IS NULL OR
            scores.status <> 'published'
          )
        LIMIT 1
      `).get(revision_id);
      if (invalid_binding) {
        return { rejected: true, reason: "unpublished_score_binding" };
      }
      const curriculum = database.prepare(`
        SELECT * FROM curriculums WHERE id = ?
      `).get(revision.curriculum_id);
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        if (curriculum.active_revision_id) {
          database.prepare(`
            UPDATE curriculum_revisions
            SET status = 'archived'
            WHERE id = ? AND id <> ?
          `).run(curriculum.active_revision_id, revision_id);
        }
        database.prepare(`
          UPDATE curriculum_revisions
          SET status = 'published', published_at = ?
          WHERE id = ?
        `).run(now, revision_id);
        database.prepare(`
          UPDATE curriculums
          SET active_revision_id = ?, status = 'published',
              updated_at = ?, created_by = COALESCE(created_by, ?)
          WHERE id = ?
        `).run(revision_id, now, user_id, revision.curriculum_id);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return this.get_active_curriculum();
    },
    list_curriculum_nodes(revision_id, include_archived = true) {
      const rows = include_archived
        ? database.prepare(`
            SELECT * FROM curriculum_nodes
            WHERE revision_id = ?
            ORDER BY parent_id IS NOT NULL, parent_id, position, created_at
          `).all(revision_id)
        : database.prepare(`
            SELECT * FROM curriculum_nodes
            WHERE revision_id = ? AND status = 'active'
            ORDER BY parent_id IS NOT NULL, parent_id, position, created_at
          `).all(revision_id);
      return rows.map(normalize_curriculum_node);
    },
    move_curriculum_node(node_id, input) {
      const current = database.prepare("SELECT * FROM curriculum_nodes WHERE id = ?")
        .get(node_id);
      if (!current) {
        return undefined;
      }
      const next_parent_id = input.parent_id === undefined ? current.parent_id : input.parent_id;
      if (next_parent_id) {
        const parent = database.prepare(`
          SELECT * FROM curriculum_nodes WHERE id = ? AND revision_id = ?
        `).get(next_parent_id, current.revision_id);
        if (!parent) {
          return undefined;
        }
      }
      const now = new Date().toISOString();
      database.prepare(`
        UPDATE curriculum_nodes
        SET parent_id = ?, position = ?, updated_at = ?
        WHERE id = ?
      `).run(next_parent_id ?? null, input.position, now, node_id);
      return normalize_curriculum_node(
        database.prepare("SELECT * FROM curriculum_nodes WHERE id = ?").get(node_id),
      );
    },
    archive_curriculum_node(node_id) {
      const current = database.prepare("SELECT * FROM curriculum_nodes WHERE id = ?")
        .get(node_id);
      if (!current) {
        return undefined;
      }
      const now = new Date().toISOString();
      database.prepare(`
        UPDATE curriculum_nodes
        SET status = 'archived', updated_at = ?
        WHERE id = ? OR parent_id = ?
      `).run(now, node_id, node_id);
      return normalize_curriculum_node(
        database.prepare("SELECT * FROM curriculum_nodes WHERE id = ?").get(node_id),
      );
    },
    list_scores(include_drafts = false) {
      const rows = include_drafts
        ? database.prepare("SELECT * FROM scores ORDER BY updated_at DESC").all()
        : database.prepare(`
            SELECT * FROM scores
            WHERE status = 'published'
            ORDER BY updated_at DESC
          `).all();
      return rows.map((row) => hydrate_score(database, row));
    },
    get_score(score_id, include_drafts = false) {
      const row = database.prepare(`
        SELECT * FROM scores
        WHERE id = ? AND (? = 1 OR status = 'published')
      `).get(score_id, include_drafts ? 1 : 0);
      return row ? hydrate_score(database, row) : undefined;
    },
    create_hymn_candidate(user_id, input) {
      const conflict = database.prepare(`
        SELECT 1 AS found FROM scores WHERE id = ? OR slug = ?
      `).get(input.score.id, input.score.slug);
      if (conflict) {
        return undefined;
      }
      const now = new Date().toISOString();
      const draft_id = randomUUID();
      const document = prepare_hymn_candidate_document(input.document);
      validate_score_document(document);
      const review = create_hymn_review_record(input.review, document);

      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT INTO scores(
            id, slug, title, status, metadata_json, current_version_id,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?)
        `).run(
          input.score.id,
          input.score.slug,
          input.score.title,
          JSON.stringify({
            kind: "hymn",
            number: document.number,
            source_id: document.provenance.source_id,
          }),
          user_id,
          now,
          now,
        );
        database.prepare(`
          INSERT INTO score_drafts(
            id, score_id, base_version_id, document_json, document_schema_version,
            hymn_review_json, updated_by, updated_at
          ) VALUES (?, ?, NULL, ?, 2, ?, ?, ?)
        `).run(
          draft_id,
          input.score.id,
          JSON.stringify(document),
          JSON.stringify(review),
          user_id,
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return {
        score: this.get_score(input.score.id, true),
        draft: this.get_score_draft(draft_id),
      };
    },
    create_score_draft(user_id, score_id, base_version_id) {
      const score = this.get_score(score_id, true);
      if (!score) {
        return undefined;
      }
      const base_version = base_version_id
        ? this.get_score_version(base_version_id)
        : score.versions.find((version) => version.id === score.current_version_id) ?? score.versions[0];
      if (!base_version || base_version.score_id !== score_id) {
        return undefined;
      }
      const now = new Date().toISOString();
      const existing = database.prepare(`
        SELECT * FROM score_drafts
        WHERE score_id = ? AND base_version_id = ?
      `).get(score_id, base_version.id);
      if (existing) {
        return normalize_score_draft(existing);
      }
      const id = randomUUID();
      const document = prepare_score_document_draft(base_version.document);
      validate_score_document(document);
      database.prepare(`
        INSERT INTO score_drafts(
          id, score_id, base_version_id, document_json, document_schema_version,
          hymn_review_json, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, 2, ?, ?, ?)
      `).run(
        id,
        score_id,
        base_version.id,
        JSON.stringify(document),
        base_version.hymn_review
          ? JSON.stringify(prepare_hymn_review_draft(base_version.hymn_review, document))
          : null,
        user_id,
        now,
      );
      return normalize_score_draft(
        database.prepare("SELECT * FROM score_drafts WHERE id = ?").get(id),
      );
    },
    get_score_draft(draft_id) {
      const row = database.prepare("SELECT * FROM score_drafts WHERE id = ?").get(draft_id);
      return row ? normalize_score_draft(row) : undefined;
    },
    apply_score_edit(user_id, draft_id, event_id, patch) {
      const draft = this.get_score_draft(draft_id);
      if (!draft) {
        return undefined;
      }
      const now = new Date().toISOString();
      const document = apply_score_event_patch(
        draft.document,
        event_id,
        patch,
        user_id,
        now,
      );
      database.prepare(`
        UPDATE score_drafts
        SET document_json = ?, document_schema_version = 2, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(document), user_id, now, draft_id);
      database.prepare(`
        INSERT INTO score_edit_events(
          id, draft_id, actor_user_id, command_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        draft_id,
        user_id,
        JSON.stringify({ type: "patch_event", event_id, patch }),
        now,
      );
      return this.get_score_draft(draft_id);
    },
    save_hymn_score_draft(user_id, draft_id, input) {
      const draft = this.get_score_draft(draft_id);
      if (!draft || !draft.hymn_review) {
        return undefined;
      }
      const now = new Date().toISOString();
      const document = prepare_saved_hymn_document(
        draft,
        input.document,
        input.review.review_state,
        user_id,
        now,
      );
      validate_score_document(document);
      const review = update_hymn_review_record(
        draft.hymn_review,
        input.review,
        document,
      );

      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          UPDATE score_drafts
          SET document_json = ?, document_schema_version = 2,
              hymn_review_json = ?, updated_by = ?, updated_at = ?
          WHERE id = ?
        `).run(
          JSON.stringify(document),
          JSON.stringify(review),
          user_id,
          now,
          draft_id,
        );
        database.prepare(`
          INSERT INTO score_edit_events(
            id, draft_id, score_version_id, actor_user_id, command_json, created_at
          ) VALUES (?, ?, NULL, ?, ?, ?)
        `).run(
          randomUUID(),
          draft_id,
          user_id,
          JSON.stringify({
            type: "replace_document",
            fields: [
              "pitch",
              "duration",
              "hand",
              "lyrics",
              "fingering",
              "hand_position",
              "chord",
            ],
            review_state: review.review_state,
          }),
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return this.get_score_draft(draft_id);
    },
    publish_score_draft(user_id, draft_id) {
      const draft = this.get_score_draft(draft_id);
      if (!draft) {
        return undefined;
      }
      const score = this.get_score(draft.score_id, true);
      if (!score) {
        return undefined;
      }
      const version_number = this.get_next_score_version_number(draft.score_id);
      const id = randomUUID();
      const now = new Date().toISOString();
      if (draft.hymn_review) {
        assert_hymn_publishable(draft.document, draft.hymn_review);
      }
      const document = prepare_score_document_for_publish(draft.document, user_id, now);
      validate_score_document(document, { for_publish: true });
      const document_json = JSON.stringify(document);
      const source_sha256 = createHash("sha256").update(document_json).digest("hex");
      const published_review = draft.hymn_review
        ? { ...draft.hymn_review, review_state: "published" }
        : undefined;
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT INTO score_versions(
            id, score_id, version_number, source_sha256, document_json,
            document_schema_version, hymn_review_json,
            musicxml_path, practice_data_path, created_by, created_at, published_at
          ) VALUES (?, ?, ?, ?, ?, 2, ?, NULL, NULL, ?, ?, ?)
        `).run(
          id,
          draft.score_id,
          version_number,
          source_sha256,
          document_json,
          published_review ? JSON.stringify(published_review) : null,
          user_id,
          now,
          now,
        );
        database.prepare(`
          UPDATE scores
          SET current_version_id = ?, status = 'published', updated_at = ?
          WHERE id = ?
        `).run(id, now, draft.score_id);
        database.prepare(`
          UPDATE score_edit_events
          SET draft_id = NULL, score_version_id = ?
          WHERE draft_id = ?
        `).run(id, draft_id);
        database.prepare("DELETE FROM score_drafts WHERE id = ?").run(draft_id);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return this.get_score_version(id);
    },
    get_next_score_version_number(score_id) {
      const row = database.prepare(`
        SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
        FROM score_versions
        WHERE score_id = ?
      `).get(score_id);
      return Number(row.version_number);
    },
    get_score_version(version_id) {
      const row = database.prepare(`
        SELECT * FROM score_versions WHERE id = ?
      `).get(version_id);
      return row ? normalize_score_version(row) : undefined;
    },
    create_user(input) {
      const now = new Date().toISOString();
      const id = randomUUID();
      database.prepare(`
        INSERT INTO users(
          id, email, display_name, role, password_hash, password_salt,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        id,
        input.email,
        input.display_name,
        input.role,
        input.password_hash,
        input.password_salt,
        now,
        now,
      );
      ensure_snapshot(database, id, now);
      return get_public_user(database.prepare("SELECT * FROM users WHERE id = ?").get(id));
    },
    update_user_credentials(user_id, input) {
      const now = new Date().toISOString();
      database.prepare(`
        UPDATE users
        SET display_name = ?, password_hash = ?, password_salt = ?, updated_at = ?
        WHERE id = ?
      `).run(input.display_name, input.password_hash, input.password_salt, now, user_id);
      return get_public_user(database.prepare("SELECT * FROM users WHERE id = ?").get(user_id));
    },
    find_user_by_email(email) {
      return database.prepare("SELECT * FROM users WHERE email = ?").get(email);
    },
    get_user_by_id(user_id) {
      return get_public_user(database.prepare("SELECT * FROM users WHERE id = ?").get(user_id));
    },
    get_user_credentials_by_id(user_id) {
      return database.prepare("SELECT * FROM users WHERE id = ?").get(user_id);
    },
    list_users() {
      return database.prepare(`
        SELECT id, email, display_name, role, status, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
      `).all().map(get_public_user);
    },
    update_user_role(user_id, role) {
      const now = new Date().toISOString();
      database.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
        .run(role, now, user_id);
      return get_public_user(database.prepare("SELECT * FROM users WHERE id = ?").get(user_id));
    },
    delete_user(user_id) {
      return Number(database.prepare("DELETE FROM users WHERE id = ?").run(user_id).changes);
    },
    create_session({ token_hash, user_id, expires_at }) {
      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO sessions(token_hash, user_id, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(token_hash, user_id, expires_at, now, now);
    },
    get_session_user(token_hash, now = new Date().toISOString()) {
      const row = database.prepare(`
        SELECT
          users.id, users.email, users.display_name, users.role, users.status,
          users.created_at, users.updated_at, sessions.expires_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `).get(token_hash, now);
      if (!row || row.status !== "active") {
        return undefined;
      }
      return get_public_user(row);
    },
    delete_session(token_hash) {
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(token_hash);
    },
    delete_user_sessions(user_id) {
      database.prepare("DELETE FROM sessions WHERE user_id = ?").run(user_id);
    },
    cleanup_expired_sessions(now = new Date().toISOString()) {
      return Number(
        database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes,
      );
    },
    get_snapshot(user_id) {
      ensure_snapshot(database, user_id);
      return parse_snapshot(
        database.prepare("SELECT * FROM user_snapshots WHERE user_id = ?").get(user_id),
      );
    },
    save_snapshot(user_id, input) {
      const current = this.get_snapshot(user_id);
      if (!input.merge_local && input.base_revision !== current.revision) {
        return { conflict: true, snapshot: current };
      }

      const progress = input.merge_local
        ? merge_progress(current.progress, input.progress)
        : input.progress;
      const preferences = input.merge_local
        ? { ...current.preferences, ...input.preferences }
        : input.preferences;
      const revision = current.revision + 1;
      const updated_at = new Date().toISOString();
      database.prepare(`
        UPDATE user_snapshots
        SET revision = ?, progress_json = ?, preferences_json = ?, updated_at = ?
        WHERE user_id = ?
      `).run(
        revision,
        JSON.stringify(progress),
        JSON.stringify(preferences),
        updated_at,
        user_id,
      );
      return {
        conflict: false,
        snapshot: { revision, progress, preferences, updated_at },
      };
    },
    create_practice_session(user_id, input) {
      const id = randomUUID();
      const created_at = new Date().toISOString();
      database.prepare(`
        INSERT INTO practice_sessions(
          id, user_id, client_result_id, lesson_id, content_version_id, input_source,
          started_at, completed_at, duration_ms, bpm, last_measure_index,
          accuracy, rhythm_accuracy, mistakes, early_steps, late_steps,
          metrics_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_result_id) DO NOTHING
      `).run(
        id,
        user_id,
        input.client_result_id,
        input.lesson_id,
        input.content_version_id ?? null,
        input.input_source,
        input.started_at,
        input.completed_at,
        input.duration_ms,
        input.bpm ?? null,
        input.last_measure_index ?? null,
        input.accuracy,
        input.rhythm_accuracy ?? null,
        input.mistakes,
        input.early_steps,
        input.late_steps,
        JSON.stringify(input.metrics),
        created_at,
      );
      const stored = database.prepare(`
        SELECT id, created_at FROM practice_sessions
        WHERE user_id = ? AND client_result_id = ?
      `).get(user_id, input.client_result_id);
      return { id: stored.id, created_at: stored.created_at };
    },
    create_practice_sessions(user_id, inputs) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const sessions = inputs.map((input) => this.create_practice_session(user_id, input));
        database.exec("COMMIT");
        return sessions;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    get_practice_summary(user_id) {
      const totals = database.prepare(`
        SELECT
          COUNT(*) AS practice_count,
          COALESCE(SUM(duration_ms), 0) AS total_duration_ms,
          COALESCE(AVG(accuracy), 0) AS average_accuracy,
          MAX(completed_at) AS last_practiced_at
        FROM practice_sessions
        WHERE user_id = ?
      `).get(user_id);
      const sources = database.prepare(`
        SELECT input_source, COUNT(*) AS count
        FROM practice_sessions
        WHERE user_id = ?
        GROUP BY input_source
        ORDER BY count DESC
      `).all(user_id);
      const weak_lessons = database.prepare(`
        SELECT
          lesson_id,
          COUNT(*) AS attempts,
          AVG(accuracy) AS average_accuracy,
          SUM(mistakes) AS mistakes
        FROM practice_sessions
        WHERE user_id = ?
        GROUP BY lesson_id
        HAVING attempts >= 1
        ORDER BY average_accuracy ASC, mistakes DESC
        LIMIT 8
      `).all(user_id);
      return {
        practice_count: Number(totals.practice_count),
        total_duration_ms: Number(totals.total_duration_ms),
        average_accuracy: Number(totals.average_accuracy),
        last_practiced_at: totals.last_practiced_at === null
          ? undefined
          : Number(totals.last_practiced_at),
        input_sources: sources.map((row) => ({
          input_source: row.input_source,
          count: Number(row.count),
        })),
        weak_lessons: weak_lessons.map((row) => ({
          lesson_id: row.lesson_id,
          attempts: Number(row.attempts),
          average_accuracy: Number(row.average_accuracy),
          mistakes: Number(row.mistakes),
        })),
      };
    },
    get_practice_sessions(user_id) {
      return database.prepare(`
        SELECT
          client_result_id, lesson_id, content_version_id, input_source,
          started_at, completed_at, duration_ms, bpm, last_measure_index,
          accuracy, rhythm_accuracy, mistakes, early_steps, late_steps,
          metrics_json, created_at
        FROM practice_sessions
        WHERE user_id = ?
        ORDER BY completed_at ASC
      `).all(user_id).map((row) => ({
        ...row,
        started_at: Number(row.started_at),
        completed_at: Number(row.completed_at),
        duration_ms: Number(row.duration_ms),
        accuracy: Number(row.accuracy),
        rhythm_accuracy: row.rhythm_accuracy === null
          ? undefined
          : Number(row.rhythm_accuracy),
        mistakes: Number(row.mistakes),
        early_steps: Number(row.early_steps),
        late_steps: Number(row.late_steps),
        metrics: parse_json(row.metrics_json, {}),
        metrics_json: undefined,
      }));
    },
    create_content(user_id, input) {
      const id = randomUUID();
      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO content_items(
          id, kind, title, status, metadata_json, current_version_id,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?)
      `).run(id, input.kind, input.title, JSON.stringify(input.metadata), user_id, now, now);
      return this.get_content(id, true);
    },
    update_content(content_id, input) {
      const current = this.get_content(content_id, true);
      if (!current) {
        return undefined;
      }
      const title = input.title ?? current.title;
      const metadata = input.metadata
        ? { ...current.metadata, ...input.metadata }
        : current.metadata;
      const now = new Date().toISOString();
      database.prepare(`
        UPDATE content_items
        SET title = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(title, JSON.stringify(metadata), now, content_id);
      return this.get_content(content_id, true);
    },
    list_content(include_drafts = false) {
      const rows = include_drafts
        ? database.prepare("SELECT * FROM content_items ORDER BY updated_at DESC").all()
        : database.prepare(`
            SELECT * FROM content_items
            WHERE status = 'published'
            ORDER BY updated_at DESC
          `).all();
      return rows.map((row) => hydrate_content(database, row));
    },
    get_content(content_id, include_drafts = false) {
      const row = database.prepare(`
        SELECT * FROM content_items
        WHERE id = ? AND (? = 1 OR status = 'published')
      `).get(content_id, include_drafts ? 1 : 0);
      return row ? hydrate_content(database, row) : undefined;
    },
    get_next_content_version_number(content_id) {
      const row = database.prepare(`
        SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
        FROM content_versions
        WHERE content_id = ?
      `).get(content_id);
      return Number(row.version_number);
    },
    create_content_version(user_id, input) {
      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO content_versions(
          id, content_id, version_number, source_sha256, musicxml_path,
          practice_data_path, created_by, created_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        input.id,
        input.content_id,
        input.version_number,
        input.source_sha256,
        input.musicxml_path,
        input.practice_data_path ?? null,
        user_id,
        now,
      );
      database.prepare("UPDATE content_items SET updated_at = ? WHERE id = ?")
        .run(now, input.content_id);
      return this.get_content_version(input.id);
    },
    get_content_version(version_id) {
      const row = database.prepare(`
        SELECT
          content_versions.*,
          content_items.status AS content_status,
          content_items.current_version_id
        FROM content_versions
        JOIN content_items ON content_items.id = content_versions.content_id
        WHERE content_versions.id = ?
      `).get(version_id);
      return row ? normalize_version(row) : undefined;
    },
    publish_content(content_id, version_id) {
      const version = this.get_content_version(version_id);
      if (!version || version.content_id !== content_id) {
        return undefined;
      }
      const now = new Date().toISOString();
      database.prepare(`
        UPDATE content_versions
        SET published_at = COALESCE(published_at, ?)
        WHERE id = ?
      `).run(now, version_id);
      database.prepare(`
        UPDATE content_items
        SET current_version_id = ?, status = 'published', updated_at = ?
        WHERE id = ?
      `).run(version_id, now, content_id);
      return this.get_content(content_id, true);
    },
    save_score_calibration(user_id, input) {
      const now = new Date().toISOString();
      const document_json = JSON.stringify(input.project.document);
      const project_json = JSON.stringify(input.project);
      const event_metadata_json = JSON.stringify(input.project.event_metadata);
      const validation_json = JSON.stringify(input.validation);
      const existing = database.prepare(`
        SELECT created_at FROM score_calibrations WHERE id = ?
      `).get(input.project.id);
      let original_sync = input.original_sync ?? {
        original_data_path: null,
        original_data_sha256: null,
        sync_state: "skipped",
      };
      database.exec("BEGIN IMMEDIATE");
      try {
        if (input.sync_original_data) {
          original_sync = input.sync_original_data();
        }
        database.prepare(`
          INSERT INTO score_calibrations(
            id, material_id, segment_id, project_json, document_json,
            event_metadata_json, validation_json, original_data_path,
            original_data_sha256, sync_state, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            material_id = excluded.material_id,
            segment_id = excluded.segment_id,
            project_json = excluded.project_json,
            document_json = excluded.document_json,
            event_metadata_json = excluded.event_metadata_json,
            validation_json = excluded.validation_json,
            original_data_path = excluded.original_data_path,
            original_data_sha256 = excluded.original_data_sha256,
            sync_state = excluded.sync_state,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        `).run(
          input.project.id,
          input.material_id,
          input.segment_id,
          project_json,
          document_json,
          event_metadata_json,
          validation_json,
          original_sync.original_data_path ?? null,
          original_sync.original_data_sha256 ?? null,
          original_sync.sync_state,
          user_id,
          existing?.created_at ?? now,
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return {
        calibration: this.get_score_calibration(input.project.id),
        original_sync,
      };
    },
    get_score_calibration(id) {
      const row = database.prepare(`
        SELECT * FROM score_calibrations WHERE id = ?
      `).get(id);
      return row ? normalize_score_calibration(row) : undefined;
    },
    list_material_deletions() {
      return database.prepare(`
        SELECT * FROM material_deletions
        WHERE deletion_status = 'deleted'
        ORDER BY deleted_at DESC
      `).all().map(normalize_material_deletion);
    },
    soft_delete_material_segment(user_id, input) {
      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO material_deletions(
          material_id, segment_id, deletion_status, deleted_by, deleted_at, updated_at
        ) VALUES (?, ?, 'deleted', ?, ?, ?)
        ON CONFLICT(material_id, segment_id) DO UPDATE SET
          deletion_status = 'deleted',
          deleted_by = excluded.deleted_by,
          updated_at = excluded.updated_at
      `).run(input.material_id, input.segment_id, user_id, now, now);
      const row = database.prepare(`
        SELECT * FROM material_deletions
        WHERE material_id = ? AND segment_id = ?
      `).get(input.material_id, input.segment_id);
      return normalize_material_deletion(row);
    },
    record_audit_event({ actor_user_id, action, target_type, target_id, details = {} }) {
      const id = randomUUID();
      database.prepare(`
        INSERT INTO audit_events(
          id, actor_user_id, action, target_type, target_id, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        actor_user_id ?? null,
        action,
        target_type,
        target_id ?? null,
        JSON.stringify(details),
        new Date().toISOString(),
      );
      return id;
    },
  };
}

function ensure_snapshot(database, user_id, now = new Date().toISOString()) {
  database.prepare(`
    INSERT OR IGNORE INTO user_snapshots(
      user_id, revision, progress_json, preferences_json, updated_at
    ) VALUES (?, 0, ?, ?, ?)
  `).run(
    user_id,
    JSON.stringify(empty_progress),
    JSON.stringify(empty_preferences),
    now,
  );
}

function parse_snapshot(row) {
  return {
    revision: Number(row.revision),
    progress: parse_json(row.progress_json, empty_progress),
    preferences: {
      ...empty_preferences,
      ...parse_json(row.preferences_json, {}),
    },
    updated_at: row.updated_at,
  };
}

function merge_progress(server_progress, local_progress) {
  const server_results = as_record(server_progress.results_by_lesson);
  const local_results = as_record(local_progress.results_by_lesson);
  const lesson_ids = new Set([...Object.keys(server_results), ...Object.keys(local_results)]);
  const results_by_lesson = {};

  for (const lesson_id of lesson_ids) {
    const seen = new Map();
    for (const result of [
      ...as_array(server_results[lesson_id]),
      ...as_array(local_results[lesson_id]),
    ]) {
      if (result && typeof result === "object") {
        seen.set(`${result.started_at}:${result.completed_at}`, result);
      }
    }
    results_by_lesson[lesson_id] = [...seen.values()]
      .sort((left, right) => Number(left.completed_at) - Number(right.completed_at))
      .slice(-32);
  }

  const server_last = String(server_progress.last_practiced_on ?? "");
  const local_last = String(local_progress.last_practiced_on ?? "");
  const latest = local_last >= server_last ? local_progress : server_progress;
  return {
    ...server_progress,
    ...local_progress,
    ...latest,
    schema_version: 2,
    completed_lesson_ids: unique_strings([
      ...as_array(server_progress.completed_lesson_ids),
      ...as_array(local_progress.completed_lesson_ids),
    ]),
    weak_lesson_ids: unique_strings([
      ...as_array(server_progress.weak_lesson_ids),
      ...as_array(local_progress.weak_lesson_ids),
    ]),
    results_by_lesson,
    streak_days: Math.max(
      Number(server_progress.streak_days) || 0,
      Number(local_progress.streak_days) || 0,
    ),
  };
}

function hydrate_content(database, row) {
  const versions = database.prepare(`
    SELECT * FROM content_versions
    WHERE content_id = ?
    ORDER BY version_number DESC
  `).all(row.id).map(normalize_version);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    metadata: parse_json(row.metadata_json, {}),
    current_version_id: row.current_version_id ?? undefined,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    versions,
  };
}

function normalize_version(row) {
  return {
    id: row.id,
    content_id: row.content_id,
    version_number: Number(row.version_number),
    source_sha256: row.source_sha256,
    musicxml_path: row.musicxml_path,
    practice_data_path: row.practice_data_path ?? undefined,
    created_by: row.created_by,
    created_at: row.created_at,
    published_at: row.published_at ?? undefined,
    content_status: row.content_status,
    current_version_id: row.current_version_id ?? undefined,
  };
}

function normalize_curriculum(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    active_revision_id: row.active_revision_id ?? undefined,
    created_by: row.created_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalize_curriculum_revision(row) {
  return {
    id: row.id,
    curriculum_id: row.curriculum_id,
    version_number: Number(row.version_number),
    status: row.status,
    title: row.title,
    description: row.description,
    created_by: row.created_by ?? undefined,
    created_at: row.created_at,
    published_at: row.published_at ?? undefined,
  };
}

function normalize_curriculum_node(row) {
  return {
    id: row.id,
    revision_id: row.revision_id,
    parent_id: row.parent_id ?? undefined,
    kind: row.kind,
    title: row.title,
    position: Number(row.position),
    payload: parse_json(row.payload_json, {}),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalize_lesson_score_binding(row) {
  return {
    id: row.id,
    lesson_node_id: row.lesson_node_id,
    score_version_id: row.score_version_id,
    role: row.role,
    position: Number(row.position),
    settings: parse_json(row.settings_json, {}),
  };
}

function hydrate_score(database, row) {
  const versions = database.prepare(`
    SELECT * FROM score_versions
    WHERE score_id = ?
    ORDER BY version_number DESC
  `).all(row.id).map(normalize_score_version);
  const drafts = database.prepare(`
    SELECT * FROM score_drafts
    WHERE score_id = ?
    ORDER BY updated_at DESC
  `).all(row.id).map(normalize_score_draft);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    metadata: parse_json(row.metadata_json, {}),
    current_version_id: row.current_version_id ?? undefined,
    created_by: row.created_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    versions,
    drafts,
  };
}

function normalize_score_version(row) {
  return {
    id: row.id,
    score_id: row.score_id,
    version_number: Number(row.version_number),
    source_sha256: row.source_sha256,
    document: normalize_persisted_score_document(row, false),
    hymn_review: row.hymn_review_json
      ? parse_json(row.hymn_review_json, undefined)
      : undefined,
    musicxml_path: row.musicxml_path ?? undefined,
    practice_data_path: row.practice_data_path ?? undefined,
    created_by: row.created_by ?? undefined,
    created_at: row.created_at,
    published_at: row.published_at ?? undefined,
  };
}

function normalize_score_draft(row) {
  return {
    id: row.id,
    score_id: row.score_id,
    base_version_id: row.base_version_id ?? undefined,
    document: normalize_persisted_score_document(row, true),
    hymn_review: row.hymn_review_json
      ? parse_json(row.hymn_review_json, undefined)
      : undefined,
    updated_by: row.updated_by ?? undefined,
    updated_at: row.updated_at,
  };
}

function normalize_persisted_score_document(row, is_draft) {
  const document = parse_json(row.document_json, create_default_score_document());
  const published_actor = row.created_by ?? (row.published_at ? "system" : null);
  const migrated = migrate_score_document(document, {
    document_status: is_draft
      ? "needs_review"
      : row.published_at
        ? "published"
        : "candidate",
    source_sha256: row.source_sha256 ?? null,
    reviewed_by: is_draft ? null : published_actor,
    reviewed_at: is_draft ? null : row.published_at ?? null,
    published_by: is_draft ? null : published_actor,
    published_at: is_draft ? null : row.published_at ?? null,
  });
  validate_score_document(migrated);
  return migrated;
}

function prepare_score_document_draft(document) {
  const next_document = structuredClone(document);
  next_document.status = "needs_review";
  next_document.review = {
    reviewed_by: null,
    reviewed_at: null,
    published_by: null,
    published_at: null,
    note: "Draft created from an immutable score version",
  };
  return next_document;
}

function prepare_hymn_candidate_document(document) {
  const next_document = structuredClone(document);
  next_document.status = "needs_review";
  next_document.review = {
    reviewed_by: null,
    reviewed_at: null,
    published_by: null,
    published_at: null,
    note: next_document.review?.note ?? "Imported hymn candidate requires review",
  };
  return next_document;
}

function prepare_saved_hymn_document(draft, document, review_state, user_id, now) {
  const next_document = structuredClone(document);
  if (next_document.id !== draft.document.id) {
    throw new Error("不能修改乐谱草稿 ID");
  }
  next_document.provenance = structuredClone(draft.document.provenance);
  next_document.status = review_state === "reviewed" ? "reviewed" : "needs_review";
  next_document.review = {
    reviewed_by: review_state === "reviewed" ? user_id : null,
    reviewed_at: review_state === "reviewed" ? now : null,
    published_by: null,
    published_at: null,
    note: review_state === "reviewed"
      ? "Hymn source and normalized preview reviewed by an administrator"
      : "Hymn draft changed by an administrator",
  };
  return next_document;
}

function create_hymn_review_record(review, document) {
  const slides = review.slides.map((slide) => ({
    ...structuredClone(slide),
    source_svg_sha256: hash_text(slide.source_svg),
    normalized_svg_sha256: hash_text(slide.normalized_svg),
  }));
  return complete_hymn_review_hashes({
    review_state: review.review_state,
    font_config_version: review.font_config_version,
    slides,
    issues: structuredClone(review.issues),
  }, document);
}

function prepare_hymn_review_draft(review, document) {
  return complete_hymn_review_hashes({
    ...structuredClone(review),
    review_state: "needs_review",
  }, document);
}

function update_hymn_review_record(current, input, document) {
  const normalized_by_slide = new Map(
    input.normalized_slides.map((slide) => [slide.slide_number, slide.svg]),
  );
  if (
    normalized_by_slide.size !== current.slides.length ||
    current.slides.some((slide) => !normalized_by_slide.has(slide.slide_number))
  ) {
    throw new Error("规范教学预览必须与来源幻灯片一一对应");
  }
  const issues_by_id = new Map(input.issues.map((issue) => [issue.id, issue]));
  if (
    issues_by_id.size !== current.issues.length ||
    current.issues.some((issue) => !issues_by_id.has(issue.id))
  ) {
    throw new Error("问题清单只能更新状态，不能删除或替换导入问题");
  }
  const issues = current.issues.map((issue) => {
    const next_issue = issues_by_id.get(issue.id);
    if (
      next_issue.code !== issue.code ||
      next_issue.kind !== issue.kind ||
      next_issue.severity !== issue.severity
    ) {
      throw new Error("问题清单的代码、类型和严重度不可修改");
    }
    return {
      ...structuredClone(issue),
      status: next_issue.status,
      message: next_issue.message,
    };
  });
  const slides = current.slides.map((slide) => {
    const normalized_svg = normalized_by_slide.get(slide.slide_number);
    return {
      ...structuredClone(slide),
      normalized_svg,
      normalized_svg_sha256: hash_text(normalized_svg),
    };
  });
  return complete_hymn_review_hashes({
    ...structuredClone(current),
    review_state: input.review_state,
    slides,
    issues,
  }, document);
}

function complete_hymn_review_hashes(review, document) {
  const document_sha256 = hash_json(document);
  const normalized_hashes = review.slides.map((slide) => ({
    slide_number: slide.slide_number,
    sha256: slide.normalized_svg_sha256,
  }));
  return {
    ...review,
    document_sha256,
    derived_hash: hash_json({
      document_sha256,
      normalized_slides: normalized_hashes,
    }),
  };
}

function assert_hymn_publishable(document, review) {
  const reasons = [];
  if (review.review_state !== "reviewed") {
    reasons.push("诗歌尚未完成审核");
  }
  if (
    review.issues.some((issue) =>
      issue.status === "unresolved" && issue.kind === "unknown_glyph")
  ) {
    reasons.push("未知字形仍未处理");
  }
  if (
    review.issues.some((issue) =>
      issue.status === "unresolved" && issue.kind === "structural")
  ) {
    reasons.push("结构问题仍未处理");
  }
  if (review.font_config_version !== document.provenance.font_config_version) {
    reasons.push("字体配置版本与 ScoreDocument 不一致");
  }

  const known_refs = new Set(
    review.slides.flatMap((slide) => slide.source_refs).map(source_ref_key),
  );
  const required_refs = collect_hymn_document_source_refs(document, reasons);
  if (required_refs.some((reference) => !known_refs.has(source_ref_key(reference)))) {
    reasons.push("ScoreDocument 包含不存在的来源引用");
  }

  if (hash_json(document) !== review.document_sha256) {
    reasons.push("ScoreDocument 与派生产物文档哈希不一致");
  }
  for (const slide of review.slides) {
    if (hash_text(slide.source_svg) !== slide.source_svg_sha256) {
      reasons.push(`第 ${slide.slide_number} 张来源 SVG 哈希不一致`);
    }
    if (hash_text(slide.normalized_svg) !== slide.normalized_svg_sha256) {
      reasons.push(`第 ${slide.slide_number} 张规范 SVG 哈希不一致`);
    }
  }
  const expected_derived_hash = hash_json({
    document_sha256: review.document_sha256,
    normalized_slides: review.slides.map((slide) => ({
      slide_number: slide.slide_number,
      sha256: slide.normalized_svg_sha256,
    })),
  });
  if (expected_derived_hash !== review.derived_hash) {
    reasons.push("规范教学派生产物哈希不一致");
  }
  if (reasons.length > 0) {
    throw new score_publish_error([...new Set(reasons)]);
  }
}

function collect_hymn_document_source_refs(document, reasons) {
  const refs = [...as_array(document.provenance?.references)];
  if (refs.length === 0) {
    reasons.push("PPTX 乐谱缺少来源引用");
  }
  for (const measure of as_array(document.measures)) {
    for (const event of as_array(measure.events)) {
      const event_refs = as_array(event.source_refs);
      if (event_refs.length === 0) {
        reasons.push(`事件 ${event.id} 缺少来源引用`);
      }
      refs.push(...event_refs);
      for (const note of as_array(event.notes)) {
        const note_refs = as_array(note.source_refs);
        if (note_refs.length === 0) {
          reasons.push(`音符 ${note.id} 缺少来源引用`);
        }
        refs.push(...note_refs, ...as_array(note.fingering?.source_refs));
      }
      refs.push(...as_array(event.chord_annotation?.source_refs));
    }
  }
  for (const lyric of as_array(document.lyrics)) {
    const lyric_refs = as_array(lyric.annotation?.source_refs);
    if (lyric_refs.length === 0) {
      reasons.push(`歌词 ${lyric.id} 缺少来源引用`);
    }
    refs.push(...lyric_refs);
  }
  for (const position of as_array(document.hand_positions)) {
    const position_refs = as_array(position.annotation?.source_refs);
    if (position_refs.length === 0) {
      reasons.push(`手位 ${position.id} 缺少来源引用`);
    }
    refs.push(...position_refs);
  }
  return refs;
}

function source_ref_key(reference) {
  return [
    reference.slide_number,
    reference.shape_id,
    reference.paragraph_index ?? "",
    reference.run_index ?? "",
  ].join(":");
}

function hash_json(value) {
  return hash_text(JSON.stringify(value));
}

function hash_text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function prepare_score_document_for_publish(document, user_id, now) {
  const next_document = structuredClone(document);
  next_document.status = "published";
  next_document.review = {
    ...next_document.review,
    reviewed_by: user_id,
    reviewed_at: now,
    published_by: user_id,
    published_at: now,
  };
  return next_document;
}

function create_manual_annotation(reason, user_id, now, source_refs = []) {
  return {
    source: "manual",
    status: "confirmed",
    reason,
    confirmed_by: user_id,
    confirmed_at: now,
    source_refs: structuredClone(source_refs),
  };
}

function apply_score_event_patch(document, event_id, patch, user_id, now) {
  const next_document = structuredClone(document);
  let changed = false;
  for (const measure of as_array(next_document.measures)) {
    for (const event of as_array(measure.events)) {
      if (event.id !== event_id) {
        continue;
      }
      changed = true;
      if (patch.onset_beats !== undefined) {
        event.onset_beats = patch.onset_beats;
      }
      if (patch.duration_beats !== undefined) {
        event.duration_beats = patch.duration_beats;
      }
      if (patch.hand !== undefined) {
        event.hand = patch.hand;
      }
      if (patch.chord !== undefined) {
        if (patch.chord) {
          event.chord = patch.chord;
          event.chord_annotation = create_manual_annotation(
            patch.chord_reason ?? "Administrator corrected the chord",
            user_id,
            now,
            event.chord_annotation?.source_refs,
          );
        } else {
          delete event.chord;
          delete event.chord_annotation;
        }
      } else if (patch.chord_reason !== undefined) {
        if (!event.chord) {
          throw new Error("和弦不存在");
        }
        event.chord_annotation = create_manual_annotation(
          patch.chord_reason,
          user_id,
          now,
          event.chord_annotation?.source_refs,
        );
      }
      if (patch.note_id !== undefined) {
        const note = as_array(event.notes).find((item) => item.id === patch.note_id);
        if (!note) {
          throw new Error("音符不存在");
        }
        if (patch.midi !== undefined) {
          note.midi = patch.midi;
        }
        if (patch.finger !== undefined) {
          if (patch.finger === null) {
            delete note.finger;
            delete note.fingering;
          } else {
            note.finger = patch.finger;
            note.fingering = create_manual_annotation(
              patch.fingering_reason ?? "Administrator corrected the fingering",
              user_id,
              now,
              note.fingering?.source_refs,
            );
          }
        } else if (patch.fingering_reason !== undefined) {
          if (note.finger === undefined) {
            throw new Error("指法不存在");
          }
          note.fingering = create_manual_annotation(
            patch.fingering_reason,
            user_id,
            now,
            note.fingering?.source_refs,
          );
        }
      }
    }
  }
  if (!changed) {
    throw new Error("乐谱事件不存在");
  }
  next_document.status = "needs_review";
  next_document.review = {
    reviewed_by: null,
    reviewed_at: null,
    published_by: null,
    published_at: null,
    note: "Draft changed by an administrator",
  };
  validate_score_document(next_document);
  return next_document;
}

function get_public_user(row) {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parse_json(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return structuredClone(fallback);
  }
}

function normalize_score_calibration(row) {
  return {
    id: row.id,
    material_id: row.material_id,
    segment_id: row.segment_id,
    project: parse_json(row.project_json, undefined),
    document: parse_json(row.document_json, undefined),
    event_metadata: parse_json(row.event_metadata_json, {}),
    validation: parse_json(row.validation_json, {}),
    original_data_path: row.original_data_path ?? undefined,
    original_data_sha256: row.original_data_sha256 ?? undefined,
    sync_state: row.sync_state,
    updated_by: row.updated_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalize_material_deletion(row) {
  return {
    material_id: row.material_id,
    segment_id: row.segment_id,
    deletion_status: row.deletion_status,
    deleted_by: row.deleted_by ?? undefined,
    deleted_at: row.deleted_at,
    updated_at: row.updated_at,
  };
}

function as_record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function as_array(value) {
  return Array.isArray(value) ? value : [];
}

function unique_strings(values) {
  return [...new Set(values.filter((value) => typeof value === "string"))];
}
