import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { hash_password } from "./auth.mjs";
import { create_request_handler } from "./app.mjs";
import { open_database } from "./database.mjs";

test("课程修订只绑定已发布乐谱并保留旧 revision 历史", async (context) => {
  const fixture = await create_fixture();
  context.after(() => fixture.close());
  const cookie = await create_admin_session(fixture);
  const repository = fixture.repository;
  const base_revision_id = "default-36-week-rev-1";
  const base_lesson_id = "lesson-w9-d1-repertoire";

  assert.throws(() => repository.raw.prepare(`
    INSERT INTO lesson_score_bindings(
      id, lesson_node_id, score_version_id, role, position, settings_json
    ) VALUES (?, ?, ?, 'reference', 99, '{}')
  `).run("orphan-binding", base_lesson_id, "missing-score-version"));

  repository.raw.prepare(`
    INSERT INTO lesson_score_bindings(
      id, lesson_node_id, score_version_id, role, position, settings_json
    ) VALUES (?, ?, ?, 'primary', 1, '{}')
  `).run(
    "legacy-binding",
    base_lesson_id,
    "score-demo-c-major-v1",
  );

  const created = await fixture.request(
    "/api/v1/admin/curriculums/default-36-week/revisions",
    {
      method: "POST",
      cookie,
      body: { base_revision_id },
    },
  );
  assert.equal(created.status, 201);
  assert.equal(created.data.revision.status, "draft");
  assert.equal(created.data.nodes.length, 690);
  assert.equal(created.data.lesson_score_bindings.length, 1);
  const revision_id = created.data.revision.id;
  const cloned_binding = created.data.lesson_score_bindings[0];
  assert.notEqual(cloned_binding.id, "legacy-binding");
  assert.notEqual(cloned_binding.lesson_node_id, base_lesson_id);
  assert.equal(cloned_binding.score_version_id, "score-demo-c-major-v1");

  create_unpublished_version(repository);
  const rejected = await fixture.request(
    `/api/v1/admin/curriculum-revisions/${revision_id}` +
      `/lesson-score-bindings/${cloned_binding.lesson_node_id}`,
    {
      method: "PUT",
      cookie,
      body: {
        score_version_id: "candidate-score-v1",
        role: "primary",
        position: 1,
        settings: {},
      },
    },
  );
  assert.equal(rejected.status, 409);
  assert.equal(rejected.data.error, "score_version_not_published");

  const saved = await fixture.request(
    `/api/v1/admin/curriculum-revisions/${revision_id}` +
      `/lesson-score-bindings/${cloned_binding.lesson_node_id}`,
    {
      method: "PUT",
      cookie,
      body: {
        score_version_id: "score-demo-c-major-v1",
        role: "primary",
        position: 1,
        settings: { source: "published-hymn" },
      },
    },
  );
  assert.equal(saved.status, 200);
  assert.equal(
    saved.data.lesson_score_binding.settings.source,
    "published-hymn",
  );

  const published = await fixture.request(
    `/api/v1/admin/curriculum-revisions/${revision_id}/publish`,
    { method: "POST", cookie, body: {} },
  );
  assert.equal(published.status, 200);
  assert.equal(published.data.curriculum.active_revision_id, revision_id);
  assert.equal(published.data.curriculum.revision.status, "published");
  assert.equal(
    published.data.curriculum.lesson_score_bindings[0].score_version_id,
    "score-demo-c-major-v1",
  );
  assert.equal(published.data.curriculum.score_versions.length, 1);
  assert.equal(
    published.data.curriculum.score_versions[0].document.status,
    "published",
  );

  const active = await fixture.request("/api/v1/curriculums/active");
  assert.equal(active.status, 200);
  assert.equal(active.data.curriculum.active_revision_id, revision_id);
  assert.equal(active.data.curriculum.score_versions.length, 1);
  assert.ok(active.data.curriculum.score_versions.every(
    (version) => version.published_at,
  ));
  assert.ok(active.data.curriculum.score_versions.every(
    (version) => version.id !== "candidate-score-v1",
  ));

  assert.equal(
    repository.get_curriculum_revision(base_revision_id).status,
    "archived",
  );
  assert.equal(
    repository.raw.prepare(`
      SELECT COUNT(*) AS count FROM curriculum_nodes WHERE revision_id = ?
    `).get(base_revision_id).count,
    690,
  );
  assert.equal(
    repository.raw.prepare(`
      SELECT score_version_id FROM lesson_score_bindings WHERE id = ?
    `).get("legacy-binding").score_version_id,
    "score-demo-c-major-v1",
  );
});

function create_unpublished_version(repository) {
  const published = repository.raw.prepare(`
    SELECT document_json, source_sha256 FROM score_versions
    WHERE id = 'score-demo-c-major-v1'
  `).get();
  const now = new Date().toISOString();
  repository.raw.prepare(`
    INSERT INTO scores(
      id, slug, title, status, metadata_json, current_version_id,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'draft', '{}', NULL, NULL, ?, ?)
  `).run("candidate-score", "candidate-score", "未审核候选", now, now);
  repository.raw.prepare(`
    INSERT INTO score_versions(
      id, score_id, version_number, source_sha256, document_json,
      document_schema_version, hymn_review_json,
      musicxml_path, practice_data_path, created_by, created_at, published_at
    ) VALUES (?, ?, 1, ?, ?, 2, NULL, NULL, NULL, NULL, ?, NULL)
  `).run(
    "candidate-score-v1",
    "candidate-score",
    published.source_sha256,
    published.document_json,
    now,
  );
}

async function create_admin_session(fixture) {
  const password = await hash_password("administrator-password");
  fixture.repository.create_user({
    email: "curriculum-admin@example.com",
    display_name: "课程管理员",
    role: "admin",
    ...password,
  });
  const login = await fixture.request("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: "curriculum-admin@example.com",
      password: "administrator-password",
    },
  });
  assert.equal(login.status, 200);
  return login.cookie;
}

async function create_fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "panio-curriculum-binding-"));
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
  await new Promise((resolve_listen) =>
    server.listen(0, "127.0.0.1", resolve_listen));
  const address = server.address();
  const base_url = `http://127.0.0.1:${address.port}`;

  return {
    repository,
    async request(path, { method = "GET", body, cookie } = {}) {
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
      const text = await response.text();
      const set_cookie = response.headers.get("set-cookie") ?? "";
      return {
        status: response.status,
        data: text ? JSON.parse(text) : undefined,
        cookie: set_cookie.split(";", 1)[0],
      };
    },
    close() {
      server.close();
      repository.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
