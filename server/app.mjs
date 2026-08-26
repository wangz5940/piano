import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

import {
  create_session_credentials,
  hash_password,
  hash_session_token,
  parse_session_cookie,
  serialize_clear_session_cookie,
  serialize_session_cookie,
  verify_password,
} from "./auth.mjs";
import { score_publish_error } from "./database.mjs";
import {
  create_rate_limiter,
  is_safe_request_target,
  resolve_static_path,
  security_headers,
} from "./security.mjs";
import {
  read_json_body,
  validate_account_deletion,
  validate_content_create,
  validate_content_update,
  validate_content_version,
  validate_curriculum_node_move,
  validate_curriculum_revision_create,
  validate_hymn_candidate_create,
  validate_lesson_score_binding,
  validate_login,
  validate_practice_session,
  validate_practice_sessions_batch,
  validate_publish,
  validate_registration,
  validate_role_update,
  validate_score_draft_create,
  validate_score_draft_save,
  validate_score_calibration_save,
  validate_score_event_patch,
  validate_snapshot,
  validation_error,
} from "./validation.mjs";

export function create_request_handler({
  repository,
  static_root,
  uploads_root,
  catalog_path,
  tls_enabled = false,
  secure_cookies = tls_enabled,
  trust_proxy = false,
  global_rate_limit = 180,
  auth_rate_limit = 10,
  logger = default_logger,
  started_at = Date.now(),
}) {
  const global_limiter = create_rate_limiter({
    limit: global_rate_limit,
    window_ms: 60_000,
  });
  const auth_limiter = create_rate_limiter({
    limit: auth_rate_limit,
    window_ms: 15 * 60_000,
  });
  const materials_root = dirname(catalog_path);
  const jianpu_catalog_path = resolve(materials_root, "jianpu-catalog.json");
  let catalog_cache;
  let jianpu_catalog_cache;

  return (request, response) => {
    const request_id = randomUUID();
    const request_started_at = performance.now();
    let pathname = "/";
    set_headers(response, security_headers);
    response.setHeader("X-Request-Id", request_id);
    if (tls_enabled) {
      response.setHeader("Strict-Transport-Security", "max-age=31536000");
    }

    response.once("finish", () => {
      logger({
        timestamp: new Date().toISOString(),
        request_id,
        method: request.method,
        path: pathname,
        status: response.statusCode,
        duration_ms: Math.round((performance.now() - request_started_at) * 10) / 10,
        user_id: request.panio_user?.id,
      });
    });

    void (async () => {
      const request_target = request.url ?? "/";
      if (!is_safe_request_target(request_target)) {
        send_error(response, 400, "bad_path", "资源地址无效。", request_id);
        return;
      }

      let url;
      try {
        url = new URL(request_target, "http://localhost");
        pathname = url.pathname;
      } catch {
        send_error(response, 400, "bad_request", "请求地址无效。", request_id);
        return;
      }

      const client_id = get_client_id(request, trust_proxy);
      const rate = global_limiter.check(client_id);
      set_rate_headers(response, global_rate_limit, rate);
      if (!rate.allowed) {
        response.setHeader("Retry-After", String(rate.retry_after_seconds));
        send_error(
          response,
          429,
          "too_many_requests",
          "请求过于频繁，请稍后再试。",
          request_id,
        );
        return;
      }

      if (pathname.startsWith("/api/")) {
        await handle_api_request({
          request,
          response,
          url,
          request_id,
          client_id,
          repository,
          uploads_root,
          materials_root,
          secure_cookies,
          auth_limiter,
          auth_rate_limit,
          started_at,
          get_catalog() {
            catalog_cache ??= JSON.parse(readFileSync(catalog_path, "utf8"));
            return catalog_cache;
          },
          get_jianpu_catalog() {
            jianpu_catalog_cache ??= JSON.parse(readFileSync(jianpu_catalog_path, "utf8"));
            return jianpu_catalog_cache;
          },
          set_catalog(next_catalog) {
            catalog_cache = next_catalog;
          },
          set_jianpu_catalog(next_catalog) {
            jianpu_catalog_cache = next_catalog;
          },
        });
        return;
      }

      handle_static_request(request, response, url, request_id, static_root);
    })().catch((error) => {
      if (response.writableEnded) {
        return;
      }
      if (error instanceof validation_error) {
        send_error(response, error.status, error.code, error.message, request_id);
        return;
      }
      logger({
        timestamp: new Date().toISOString(),
        request_id,
        level: "error",
        event: "request_failed",
        error_name: error instanceof Error ? error.name : "unknown_error",
      });
      send_error(
        response,
        500,
        "internal_error",
        "服务暂时无法处理请求。",
        request_id,
      );
    });
  };
}

async function handle_api_request(context) {
  const {
    request,
    response,
    url,
    request_id,
    client_id,
    repository,
    materials_root,
    secure_cookies,
  } = context;
  const { pathname } = url;
  const method = request.method ?? "GET";

  if (pathname === "/api/v1/health" && (method === "GET" || method === "HEAD")) {
    send_json(response, 200, {
      status: "ok",
      service: "panio",
      uptime_seconds: Math.floor((Date.now() - context.started_at) / 1_000),
    }, method === "HEAD");
    return;
  }

  if (is_write_method(method) && request.headers["x-panio-client"] !== "web") {
    send_error(
      response,
      403,
      "client_header_required",
      "写入请求缺少客户端标识。",
      request_id,
    );
    return;
  }

  if (
    (pathname === "/api/v1/auth/register" || pathname === "/api/v1/auth/login") &&
    method === "POST"
  ) {
    const rate = context.auth_limiter.check(`${pathname}:${client_id}`);
    response.setHeader("RateLimit-Policy", `${context.auth_rate_limit};w=900`);
    if (!rate.allowed) {
      response.setHeader("Retry-After", String(rate.retry_after_seconds));
      send_error(
        response,
        429,
        "auth_rate_limited",
        "登录或注册尝试过于频繁，请稍后再试。",
        request_id,
      );
      return;
    }
  }

  if (pathname === "/api/v1/auth/register" && method === "POST") {
    const input = validate_registration(await read_json_body(request));
    let password;
    try {
      password = await hash_password(input.password);
      const user = repository.create_user({ ...input, ...password });
      const session = create_session_credentials();
      repository.create_session({
        token_hash: session.token_hash,
        user_id: user.id,
        expires_at: session.expires_at,
      });
      repository.record_audit_event({
        actor_user_id: user.id,
        action: "auth.register",
        target_type: "user",
        target_id: user.id,
      });
      response.setHeader("Set-Cookie", serialize_session_cookie(session.token, {
        secure: secure_cookies,
        max_age_seconds: session.max_age_seconds,
      }));
      send_json(response, 201, {
        user,
        snapshot: repository.get_snapshot(user.id),
      });
    } catch (error) {
      if (String(error?.message).includes("UNIQUE constraint failed")) {
        send_error(response, 409, "email_exists", "该邮箱已经注册。", request_id);
        return;
      }
      throw error;
    }
    return;
  }

  if (pathname === "/api/v1/auth/login" && method === "POST") {
    const input = validate_login(await read_json_body(request));
    const account = repository.find_user_by_email(input.email);
    const password_matches = account
      ? await verify_password(input.password, account)
      : await consume_password_work(input.password);
    if (!account || !password_matches || account.status !== "active") {
      send_error(response, 401, "invalid_credentials", "邮箱或密码错误。", request_id);
      return;
    }
    const session = create_session_credentials();
    repository.create_session({
      token_hash: session.token_hash,
      user_id: account.id,
      expires_at: session.expires_at,
    });
    response.setHeader("Set-Cookie", serialize_session_cookie(session.token, {
      secure: secure_cookies,
      max_age_seconds: session.max_age_seconds,
    }));
    repository.record_audit_event({
      actor_user_id: account.id,
      action: "auth.login",
      target_type: "session",
    });
    send_json(response, 200, {
      user: repository.get_user_by_id(account.id),
      snapshot: repository.get_snapshot(account.id),
    });
    return;
  }

  if (pathname === "/api/v1/auth/logout" && method === "POST") {
    const { token } = parse_session_cookie(request.headers.cookie);
    if (token) {
      repository.delete_session(hash_session_token(token));
    }
    response.setHeader("Set-Cookie", serialize_clear_session_cookie({
      secure: secure_cookies,
    }));
    send_json(response, 200, { status: "logged_out" });
    return;
  }

  const user = authenticate_request(request, repository);

  if (pathname === "/api/v1/auth/me" && method === "GET") {
    require_user(user);
    send_json(response, 200, {
      user,
      snapshot: repository.get_snapshot(user.id),
    });
    return;
  }

  if (pathname === "/api/v1/me/snapshot" && method === "GET") {
    require_user(user);
    send_json(response, 200, { snapshot: repository.get_snapshot(user.id) });
    return;
  }

  if (pathname === "/api/v1/me/snapshot" && method === "PUT") {
    require_user(user);
    const input = validate_snapshot(await read_json_body(request, 2 * 1_024 * 1_024));
    const result = repository.save_snapshot(user.id, input);
    if (result.conflict) {
      send_json(response, 409, {
        error: "sync_conflict",
        message: "其他设备已经更新学习数据。",
        request_id,
        snapshot: result.snapshot,
      });
      return;
    }
    send_json(response, 200, { snapshot: result.snapshot });
    return;
  }

  if (pathname === "/api/v1/me/export" && method === "GET") {
    require_user(user);
    send_json(response, 200, {
      exported_at: new Date().toISOString(),
      user,
      snapshot: repository.get_snapshot(user.id),
      practice_sessions: repository.get_practice_sessions(user.id),
    });
    return;
  }

  if (pathname === "/api/v1/me" && method === "DELETE") {
    require_user(user);
    const input = validate_account_deletion(await read_json_body(request));
    const credentials = repository.get_user_credentials_by_id(user.id);
    if (!credentials || !(await verify_password(input.password, credentials))) {
      send_error(response, 401, "invalid_credentials", "密码错误。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "account.delete",
      target_type: "user",
      target_id: user.id,
    });
    repository.delete_user(user.id);
    response.setHeader("Set-Cookie", serialize_clear_session_cookie({
      secure: secure_cookies,
    }));
    send_json(response, 200, { status: "deleted" });
    return;
  }

  if (pathname === "/api/v1/practice-sessions" && method === "POST") {
    require_user(user);
    const input = validate_practice_session(await read_json_body(request));
    const session = repository.create_practice_session(user.id, input);
    send_json(response, 201, { practice_session: session });
    return;
  }

  if (pathname === "/api/v1/practice-sessions/batch" && method === "POST") {
    require_user(user);
    const sessions = validate_practice_sessions_batch(
      await read_json_body(request, 2 * 1_024 * 1_024),
    );
    const stored = repository.create_practice_sessions(user.id, sessions);
    send_json(response, 201, {
      stored_count: stored.length,
      practice_sessions: stored,
    });
    return;
  }

  if (pathname === "/api/v1/practice-sessions/summary" && method === "GET") {
    require_user(user);
    send_json(response, 200, {
      summary: repository.get_practice_summary(user.id),
    });
    return;
  }

  if (pathname === "/api/v1/curriculums/active" && method === "GET") {
    const bundle = repository.get_active_curriculum();
    if (!bundle) {
      send_error(response, 404, "not_found", "当前没有已发布课程。", request_id);
      return;
    }
    send_json(response, 200, { curriculum: serialize_curriculum_bundle(bundle) });
    return;
  }

  if (pathname === "/api/v1/content/materials" && method === "GET") {
    send_json(
      response,
      200,
      apply_material_segment_deletions(
        context.get_catalog(),
        repository.list_material_deletions(),
      ),
    );
    return;
  }

  if (pathname === "/api/v1/content/jianpu-materials" && method === "GET") {
    send_json(
      response,
      200,
      apply_material_segment_deletions(
        context.get_jianpu_catalog(),
        repository.list_material_deletions(),
      ),
    );
    return;
  }

  if (pathname === "/api/v1/content" && method === "GET") {
    send_json(response, 200, {
      content: repository.list_content(false).map(serialize_content),
    });
    return;
  }

  const content_match = pathname.match(/^\/api\/v1\/content\/([A-Za-z0-9._:-]+)$/);
  if (content_match && method === "GET") {
    const content = repository.get_content(content_match[1], false);
    if (!content) {
      send_error(response, 404, "not_found", "内容不存在。", request_id);
      return;
    }
    send_json(response, 200, { content: serialize_content(content) });
    return;
  }

  const version_file_match = pathname.match(
    /^\/api\/v1\/content\/([A-Za-z0-9._:-]+)\/versions\/([A-Za-z0-9._:-]+)\/(musicxml|practice-data)$/,
  );
  if (version_file_match && method === "GET") {
    const [, content_id, version_id, asset_kind] = version_file_match;
    const version = repository.get_content_version(version_id);
    const can_read_draft = user?.role === "admin";
    if (
      !version ||
      version.content_id !== content_id ||
      (!version.published_at && !can_read_draft)
    ) {
      send_error(response, 404, "not_found", "内容版本不存在。", request_id);
      return;
    }
    const file_path = asset_kind === "musicxml"
      ? version.musicxml_path
      : version.practice_data_path;
    if (!file_path || !is_regular_file(file_path)) {
      send_error(response, 404, "not_found", "版本资源不存在。", request_id);
      return;
    }
    serve_file(request, response, file_path);
    return;
  }

  if (pathname === "/api/v1/admin/users" && method === "GET") {
    require_admin(user);
    send_json(response, 200, { users: repository.list_users() });
    return;
  }

  const user_role_match = pathname.match(
    /^\/api\/v1\/admin\/users\/([A-Za-z0-9._:-]+)\/role$/,
  );
  if (user_role_match && method === "PATCH") {
    require_admin(user);
    const target_user = repository.get_user_by_id(user_role_match[1]);
    if (!target_user) {
      send_error(response, 404, "not_found", "用户不存在。", request_id);
      return;
    }
    if (target_user.role === "admin") {
      send_error(
        response,
        400,
        "protected_admin_role",
        "管理员角色只能通过服务器命令维护。",
        request_id,
      );
      return;
    }
    const input = validate_role_update(await read_json_body(request));
    const updated_user = repository.update_user_role(user_role_match[1], input.role);
    repository.delete_user_sessions(updated_user.id);
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.user_role.update",
      target_type: "user",
      target_id: updated_user.id,
      details: { role: input.role },
    });
    send_json(response, 200, { user: updated_user });
    return;
  }

  if (pathname === "/api/v1/admin/content" && method === "GET") {
    require_admin(user);
    send_json(response, 200, {
      content: repository.list_content(true)
        .map((content) => serialize_content(content, true)),
    });
    return;
  }

  if (pathname === "/api/v1/admin/curriculums/active/nodes" && method === "GET") {
    require_admin(user);
    const bundle = repository.get_active_curriculum();
    if (!bundle) {
      send_error(response, 404, "not_found", "当前没有已发布课程。", request_id);
      return;
    }
    send_json(response, 200, {
      curriculum: serialize_curriculum_bundle({
        ...bundle,
        nodes: repository.list_curriculum_nodes(bundle.revision.id, true),
      }),
    });
    return;
  }

  const create_curriculum_revision_match = pathname.match(
    /^\/api\/v1\/admin\/curriculums\/([A-Za-z0-9._:-]+)\/revisions$/,
  );
  if (create_curriculum_revision_match && method === "POST") {
    require_admin(user);
    const input = validate_curriculum_revision_create(
      await read_json_body(request),
    );
    const created = repository.create_curriculum_revision(
      user.id,
      create_curriculum_revision_match[1],
      input.base_revision_id,
    );
    if (!created) {
      send_error(
        response,
        404,
        "not_found",
        "课程或基础修订不存在。",
        request_id,
      );
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.curriculum_revision.create",
      target_type: "curriculum_revision",
      target_id: created.revision.id,
      details: {
        curriculum_id: create_curriculum_revision_match[1],
        base_revision_id: input.base_revision_id,
      },
    });
    send_json(response, 201, {
      revision: serialize_curriculum_revision(created.revision),
      nodes: created.nodes.map(serialize_curriculum_node),
      lesson_score_bindings: created.bindings.map(
        serialize_lesson_score_binding,
      ),
    });
    return;
  }

  const bind_lesson_score_match = pathname.match(
    /^\/api\/v1\/admin\/curriculum-revisions\/([A-Za-z0-9._:-]+)\/lesson-score-bindings\/([A-Za-z0-9._:-]+)$/,
  );
  if (bind_lesson_score_match && method === "PUT") {
    require_admin(user);
    const input = validate_lesson_score_binding(
      await read_json_body(request),
    );
    const binding = repository.upsert_lesson_score_binding(
      bind_lesson_score_match[1],
      bind_lesson_score_match[2],
      input,
    );
    if (!binding) {
      send_error(
        response,
        404,
        "not_found",
        "草稿课程修订或课程节点不存在。",
        request_id,
      );
      return;
    }
    if (binding.rejected) {
      send_error(
        response,
        409,
        binding.reason,
        "只能绑定已发布的不可变乐谱版本。",
        request_id,
      );
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.lesson_score_binding.upsert",
      target_type: "lesson_score_binding",
      target_id: binding.id,
      details: {
        revision_id: bind_lesson_score_match[1],
        lesson_node_id: bind_lesson_score_match[2],
        score_version_id: binding.score_version_id,
      },
    });
    send_json(response, 200, {
      lesson_score_binding: serialize_lesson_score_binding(binding),
    });
    return;
  }

  const publish_curriculum_revision_match = pathname.match(
    /^\/api\/v1\/admin\/curriculum-revisions\/([A-Za-z0-9._:-]+)\/publish$/,
  );
  if (publish_curriculum_revision_match && method === "POST") {
    require_admin(user);
    const bundle = repository.publish_curriculum_revision(
      user.id,
      publish_curriculum_revision_match[1],
    );
    if (!bundle) {
      send_error(
        response,
        404,
        "not_found",
        "草稿课程修订不存在。",
        request_id,
      );
      return;
    }
    if (bundle.rejected) {
      send_error(
        response,
        409,
        bundle.reason,
        "课程仍包含未发布乐谱绑定。",
        request_id,
      );
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.curriculum_revision.publish",
      target_type: "curriculum_revision",
      target_id: bundle.revision.id,
      details: { curriculum_id: bundle.curriculum.id },
    });
    send_json(response, 200, {
      curriculum: serialize_curriculum_bundle(bundle),
    });
    return;
  }

  const move_node_match = pathname.match(
    /^\/api\/v1\/admin\/curriculum-nodes\/([A-Za-z0-9._:-]+)\/move$/,
  );
  if (move_node_match && method === "PATCH") {
    require_admin(user);
    const input = validate_curriculum_node_move(await read_json_body(request));
    const node = repository.move_curriculum_node(move_node_match[1], input);
    if (!node) {
      send_error(response, 404, "not_found", "课程节点不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.curriculum_node.move",
      target_type: "curriculum_node",
      target_id: node.id,
      details: input,
    });
    send_json(response, 200, { node: serialize_curriculum_node(node) });
    return;
  }

  const archive_node_match = pathname.match(
    /^\/api\/v1\/admin\/curriculum-nodes\/([A-Za-z0-9._:-]+)\/archive$/,
  );
  if (archive_node_match && method === "PATCH") {
    require_admin(user);
    const node = repository.archive_curriculum_node(archive_node_match[1]);
    if (!node) {
      send_error(response, 404, "not_found", "课程节点不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.curriculum_node.archive",
      target_type: "curriculum_node",
      target_id: node.id,
    });
    send_json(response, 200, { node: serialize_curriculum_node(node) });
    return;
  }

  if (pathname === "/api/v1/admin/scores" && method === "GET") {
    require_admin(user);
    send_json(response, 200, {
      scores: repository.list_scores(true).map(serialize_score),
    });
    return;
  }

  const delete_material_segment_match = pathname.match(
    /^\/api\/v1\/admin\/materials\/([A-Za-z0-9._:-]+)\/segments\/([A-Za-z0-9._:-]+)$/,
  );
  if (delete_material_segment_match && method === "DELETE") {
    require_admin(user);
    const [, material_id, segment_id] = delete_material_segment_match;
    if (!material_segment_exists(
      context.get_catalog(),
      context.get_jianpu_catalog(),
      material_id,
      segment_id,
    )) {
      send_error(response, 404, "material_segment_not_found", "教材片段不存在。", request_id);
      return;
    }
    const deletion = repository.soft_delete_material_segment(user.id, {
      material_id,
      segment_id,
    });
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.material_segment.delete",
      target_type: "material_segment",
      target_id: `${material_id}:${segment_id}`,
      details: {
        material_id,
        segment_id,
        deletion_status: deletion.deletion_status,
      },
    });
    send_json(response, 200, {
      material_deletion: serialize_material_deletion(deletion),
    });
    return;
  }

  if (pathname === "/api/v1/admin/calibrations" && method === "POST") {
    require_admin(user);
    const input = validate_score_calibration_save(
      await read_json_body(request, 16 * 1_024 * 1_024),
      { published_by: user.id },
    );
    const saved = repository.save_score_calibration(user.id, {
      ...input,
      sync_original_data: () => sync_calibration_original_data(
        input,
        materials_root,
        context.set_catalog,
        context.set_jianpu_catalog,
      ),
    });
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.score_calibration.save",
      target_type: "score_calibration",
      target_id: saved.calibration.id,
      details: {
        material_id: input.material_id,
        segment_id: input.segment_id,
        sync_state: saved.original_sync.sync_state,
        original_data_path: saved.original_sync.original_data_path,
      },
    });
    send_json(response, 200, {
      calibration: serialize_score_calibration(saved.calibration),
      original_sync: saved.original_sync,
    });
    return;
  }

  if (pathname === "/api/v1/admin/hymn-candidates" && method === "POST") {
    require_admin(user);
    const input = validate_hymn_candidate_create(
      await read_json_body(request, 16 * 1_024 * 1_024),
    );
    const candidate = repository.create_hymn_candidate(user.id, input);
    if (!candidate) {
      send_error(
        response,
        409,
        "score_candidate_exists",
        "同 ID 或 slug 的诗歌候选已经存在。",
        request_id,
      );
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.hymn_candidate.create",
      target_type: "score_draft",
      target_id: candidate.draft.id,
      details: { score_id: candidate.score.id },
    });
    send_json(response, 201, {
      candidate: {
        score: serialize_score(candidate.score),
        draft: serialize_score_draft(candidate.draft),
      },
    });
    return;
  }

  if (pathname === "/api/v1/admin/content" && method === "POST") {
    require_admin(user);
    const input = validate_content_create(await read_json_body(request));
    const content = repository.create_content(user.id, input);
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.content.create",
      target_type: "content",
      target_id: content.id,
      details: { kind: content.kind },
    });
    send_json(response, 201, { content: serialize_content(content, true) });
    return;
  }

  const create_score_draft_match = pathname.match(
    /^\/api\/v1\/admin\/scores\/([A-Za-z0-9._:-]+)\/drafts$/,
  );
  if (create_score_draft_match && method === "POST") {
    require_admin(user);
    const input = validate_score_draft_create(await read_json_body(request));
    const draft = repository.create_score_draft(
      user.id,
      create_score_draft_match[1],
      input.base_version_id,
    );
    if (!draft) {
      send_error(response, 404, "not_found", "乐谱或基础版本不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.score_draft.create",
      target_type: "score_draft",
      target_id: draft.id,
      details: { score_id: draft.score_id, base_version_id: draft.base_version_id },
    });
    send_json(response, 201, { draft: serialize_score_draft(draft) });
    return;
  }

  const patch_score_event_match = pathname.match(
    /^\/api\/v1\/admin\/score-drafts\/([A-Za-z0-9._:-]+)\/events\/([A-Za-z0-9._:-]+)$/,
  );
  if (patch_score_event_match && method === "PATCH") {
    require_admin(user);
    const patch = validate_score_event_patch(await read_json_body(request));
    let draft;
    try {
      draft = repository.apply_score_edit(
        user.id,
        patch_score_event_match[1],
        patch_score_event_match[2],
        patch,
      );
    } catch (error) {
      if (error instanceof Error) {
        send_error(response, 400, "invalid_score_edit", error.message, request_id);
        return;
      }
      throw error;
    }
    if (!draft) {
      send_error(response, 404, "not_found", "乐谱草稿不存在。", request_id);
      return;
    }
    send_json(response, 200, { draft: serialize_score_draft(draft) });
    return;
  }

  const save_score_draft_match = pathname.match(
    /^\/api\/v1\/admin\/score-drafts\/([A-Za-z0-9._:-]+)$/,
  );
  if (save_score_draft_match && method === "PATCH") {
    require_admin(user);
    const input = validate_score_draft_save(
      await read_json_body(request, 16 * 1_024 * 1_024),
    );
    let draft;
    try {
      draft = repository.save_hymn_score_draft(
        user.id,
        save_score_draft_match[1],
        input,
      );
    } catch (error) {
      if (error instanceof Error) {
        send_error(response, 400, "invalid_score_edit", error.message, request_id);
        return;
      }
      throw error;
    }
    if (!draft) {
      send_error(response, 404, "not_found", "诗歌乐谱草稿不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.hymn_score_draft.save",
      target_type: "score_draft",
      target_id: draft.id,
      details: { score_id: draft.score_id },
    });
    send_json(response, 200, { draft: serialize_score_draft(draft) });
    return;
  }

  const publish_score_draft_match = pathname.match(
    /^\/api\/v1\/admin\/score-drafts\/([A-Za-z0-9._:-]+)\/publish$/,
  );
  if (publish_score_draft_match && method === "POST") {
    require_admin(user);
    let version;
    try {
      version = repository.publish_score_draft(user.id, publish_score_draft_match[1]);
    } catch (error) {
      if (error instanceof score_publish_error) {
        send_error(response, 409, error.code, error.message, request_id);
        return;
      }
      throw error;
    }
    if (!version) {
      send_error(response, 404, "not_found", "乐谱草稿不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.score_draft.publish",
      target_type: "score_version",
      target_id: version.id,
      details: { score_id: version.score_id, version_number: version.version_number },
    });
    send_json(response, 200, { version: serialize_score_version(version) });
    return;
  }

  const admin_content_match = pathname.match(
    /^\/api\/v1\/admin\/content\/([A-Za-z0-9._:-]+)$/,
  );
  if (admin_content_match && method === "PATCH") {
    require_admin(user);
    const input = validate_content_update(await read_json_body(request));
    const content = repository.update_content(admin_content_match[1], input);
    if (!content) {
      send_error(response, 404, "not_found", "内容不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.content.update",
      target_type: "content",
      target_id: content.id,
    });
    send_json(response, 200, { content: serialize_content(content, true) });
    return;
  }

  const create_version_match = pathname.match(
    /^\/api\/v1\/admin\/content\/([A-Za-z0-9._:-]+)\/versions$/,
  );
  if (create_version_match && method === "POST") {
    require_admin(user);
    const content_id = create_version_match[1];
    if (!repository.get_content(content_id, true)) {
      send_error(response, 404, "not_found", "内容不存在。", request_id);
      return;
    }
    const body = await read_json_body(request, 4 * 1_024 * 1_024);
    const raw_musicxml = typeof body.musicxml_text === "string" ? body.musicxml_text : "";
    const source_sha256 = createHash("sha256").update(raw_musicxml).digest("hex");
    const input = validate_content_version(body, source_sha256);
    const version = persist_content_version({
      repository,
      uploads_root: context.uploads_root,
      user_id: user.id,
      content_id,
      source_sha256,
      ...input,
    });
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.content_version.create",
      target_type: "content_version",
      target_id: version.id,
      details: { content_id, version_number: version.version_number },
    });
    send_json(response, 201, { version: serialize_version(version) });
    return;
  }

  const publish_match = pathname.match(
    /^\/api\/v1\/admin\/content\/([A-Za-z0-9._:-]+)\/publish$/,
  );
  if (publish_match && method === "POST") {
    require_admin(user);
    const input = validate_publish(await read_json_body(request));
    const content = repository.publish_content(publish_match[1], input.version_id);
    if (!content) {
      send_error(response, 404, "not_found", "内容或版本不存在。", request_id);
      return;
    }
    repository.record_audit_event({
      actor_user_id: user.id,
      action: "admin.content.publish",
      target_type: "content",
      target_id: content.id,
      details: { version_id: input.version_id },
    });
    send_json(response, 200, { content: serialize_content(content, true) });
    return;
  }

  send_error(response, 404, "not_found", "接口不存在。", request_id);
}

function authenticate_request(request, repository) {
  const { token } = parse_session_cookie(request.headers.cookie);
  if (!token) {
    return undefined;
  }
  const user = repository.get_session_user(hash_session_token(token));
  request.panio_user = user;
  return user;
}

function require_user(user) {
  if (!user) {
    throw new validation_error("请先登录。", 401, "authentication_required");
  }
}

function require_admin(user) {
  require_user(user);
  if (user.role !== "admin") {
    throw new validation_error("当前账号没有管理权限。", 403, "permission_denied");
  }
}

async function consume_password_work(password) {
  void password;
  await hash_password("invalid-login-password");
  return false;
}

function persist_content_version({
  repository,
  uploads_root,
  user_id,
  content_id,
  source_sha256,
  musicxml_text,
  practice_data,
}) {
  const version_number = repository.get_next_content_version_number(content_id);
  const version_id = randomUUID();
  const version_dir = resolve(uploads_root, content_id, String(version_number));
  const musicxml_path = resolve(version_dir, "score.musicxml");
  const practice_data_path = practice_data
    ? resolve(version_dir, "practice.json")
    : undefined;
  mkdirSync(version_dir, { recursive: true, mode: 0o700 });

  try {
    atomic_write(musicxml_path, musicxml_text);
    if (practice_data_path) {
      atomic_write(practice_data_path, JSON.stringify(practice_data));
    }
    return repository.create_content_version(user_id, {
      id: version_id,
      content_id,
      version_number,
      source_sha256,
      musicxml_path,
      practice_data_path,
    });
  } catch (error) {
    rmSync(version_dir, { force: true, recursive: true });
    throw error;
  }
}

function atomic_write(file_path, content) {
  const temporary_path = `${file_path}.${randomUUID()}.tmp`;
  writeFileSync(temporary_path, content, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary_path, file_path);
}

function sync_calibration_original_data(
  input,
  materials_root,
  set_catalog,
  set_jianpu_catalog,
) {
  const jianpu_catalog_path = resolve(materials_root, "jianpu-catalog.json");
  const jianpu_catalog = JSON.parse(readFileSync(jianpu_catalog_path, "utf8"));
  const material = jianpu_catalog.materials?.find((candidate) =>
    candidate.id === input.material_id);
  const segment = material?.segments?.find((candidate) =>
    candidate.id === input.segment_id);
  if (!segment?.jianpu_url) {
    throw new validation_error("未找到对应的教材简谱原始数据", 404, "material_segment_not_found");
  }
  const has_catalog_updates = sync_calibration_material_catalog(
    input.project.material_catalog,
    material,
    input.segment_id,
    input.project.title,
  );
  const material_catalog_sync = sync_calibration_material_library_catalog(
    materials_root,
    input.material_id,
    input.segment_id,
    input.project.title,
  );

  const relative_path = segment.jianpu_url.replace(/^\/+materials\//, "");
  const target_path = resolve(materials_root, relative_path);
  const jianpu_root = resolve(materials_root, "jianpu");
  const target_relative = relative(jianpu_root, target_path);
  if (
    target_relative.startsWith("..") ||
    target_relative === "" ||
    target_relative.includes(":") ||
    extname(target_path) !== ".json"
  ) {
    throw new validation_error("教材简谱路径无效", 400, "invalid_material_path");
  }

  const original_data = score_document_to_jianpu_score(
    input.project.document,
    input.segment_id,
    input.project.event_metadata ?? {},
  );
  const serialized = `${JSON.stringify(original_data)}\n`;
  atomic_write(target_path, serialized);
  const musicxml_sync = sync_calibration_musicxml_original_data(
    input,
    segment,
    materials_root,
  );
  if (has_catalog_updates) {
    atomic_write(jianpu_catalog_path, `${JSON.stringify(jianpu_catalog, null, 2)}\n`);
    set_jianpu_catalog?.(jianpu_catalog);
  }
  if (material_catalog_sync.changed) {
    atomic_write(
      material_catalog_sync.catalog_path,
      `${JSON.stringify(material_catalog_sync.catalog, null, 2)}\n`,
    );
    set_catalog?.(material_catalog_sync.catalog);
  }
  return {
    original_data_path: target_path,
    original_data_sha256: createHash("sha256").update(serialized).digest("hex"),
    musicxml_path: musicxml_sync.musicxml_path,
    musicxml_sha256: musicxml_sync.musicxml_sha256,
    sync_state: "synced",
  };
}

function sync_calibration_material_library_catalog(
  materials_root,
  material_id,
  segment_id,
  project_title,
) {
  const catalog_path = resolve(materials_root, "catalog.json");
  const catalog = JSON.parse(readFileSync(catalog_path, "utf8"));
  const normalized_project_title = String(project_title ?? "").trim();
  if (!normalized_project_title) {
    return { catalog_path, catalog, changed: false };
  }
  const material = catalog.materials?.find((candidate) =>
    candidate.id === material_id);
  const segment = material?.segments?.find((candidate) =>
    candidate.id === segment_id);
  if (!segment || segment.title === normalized_project_title) {
    return { catalog_path, catalog, changed: false };
  }
  segment.title = normalized_project_title;
  return { catalog_path, catalog, changed: true };
}

function sync_calibration_musicxml_original_data(input, segment, materials_root) {
  if (!segment?.musicxml_url) {
    throw new validation_error("未找到对应的教材五线谱原始数据", 404, "material_musicxml_not_found");
  }
  const relative_path = segment.musicxml_url.replace(/^\/+materials\//, "");
  const target_path = resolve(materials_root, relative_path);
  const target_relative = relative(materials_root, target_path);
  if (
    target_relative.startsWith("..") ||
    target_relative === "" ||
    target_relative.includes(":") ||
    ![".musicxml", ".xml"].includes(extname(target_path))
  ) {
    throw new validation_error("教材五线谱路径无效", 400, "invalid_material_musicxml_path");
  }

  const serialized = score_document_to_musicxml(
    input.project.document,
    input.project.event_metadata ?? {},
  );
  atomic_write(target_path, serialized);
  return {
    musicxml_path: target_path,
    musicxml_sha256: createHash("sha256").update(serialized).digest("hex"),
  };
}

function sync_calibration_material_catalog(
  material_catalog,
  material,
  segment_id,
  project_title,
) {
  if (!Array.isArray(material.chapters)) {
    return false;
  }
  let changed = false;
  if (material_catalog?.chapters) {
    const title_by_chapter_id = new Map(
      material_catalog.chapters.map((chapter) => [chapter.id, chapter.title]),
    );
    for (const chapter of material.chapters) {
      const title = title_by_chapter_id.get(chapter.id);
      if (title && chapter.title !== title) {
        chapter.title = title;
        changed = true;
      }
    }
    for (const segment of material.segments ?? []) {
      for (const slice of segment.page_slices ?? []) {
        const title = title_by_chapter_id.get(slice.chapter_id);
        if (title && slice.chapter_title !== title) {
          slice.chapter_title = title;
          changed = true;
        }
      }
    }
  }
  const normalized_project_title = String(project_title ?? "").trim();
  if (normalized_project_title) {
    const segment = material.segments?.find((candidate) => candidate.id === segment_id);
    if (segment && segment.title !== normalized_project_title) {
      segment.title = normalized_project_title;
      changed = true;
    }
    for (const slice of segment?.page_slices ?? []) {
      if (slice.title !== normalized_project_title) {
        slice.title = normalized_project_title;
        changed = true;
      }
    }
  }
  return changed;
}

export function score_document_to_jianpu_score(document, segment_id, event_metadata = {}) {
  return {
    schema_version: "1.0",
    segment_id,
    key_signature: document.key_signature,
    tonic_midi: document.tonic_midi,
    time_signature: document.time_signature,
    measures: document.measures.map((measure, index) => ({
      index: Number(measure.number) || index + 1,
      number: measure.number,
      directions: [],
    events: score_events_to_jianpu_events(measure.events, event_metadata),
    })),
  };
}

function score_events_to_jianpu_events(events, event_metadata = {}) {
  const grouped = new Map();
  for (const event of events) {
    const key = [
      round_score_number(event.onset_beats),
      round_score_number(event.duration_beats),
      event.chord ?? "",
    ].join("|");
    const existing = grouped.get(key) ?? {
      onset_beats: round_score_number(event.onset_beats),
      duration_beats: round_score_number(event.duration_beats),
      right_notes: [],
      left_notes: [],
      right_fingerings: [],
      left_fingerings: [],
      right_slur: undefined,
      left_slur: undefined,
      chord: event.chord ?? null,
    };
    const target = event.hand === "left" ? existing.left_notes : existing.right_notes;
    const fingering_target = event.hand === "left"
      ? existing.left_fingerings
      : existing.right_fingerings;
    const slur = normalize_jianpu_slur(event_metadata[event.id]?.slur);
    if (event.hand === "left") {
      existing.left_slur = merge_jianpu_slur(existing.left_slur, slur);
    } else {
      existing.right_slur = merge_jianpu_slur(existing.right_slur, slur);
    }
    for (const note of event.notes) {
      target.push(note.midi);
      if (note.finger !== undefined) {
        fingering_target.push({
          note: note.midi,
          finger: note.finger,
          source: note.fingering?.source === "generated" ? "generated" : "score",
        });
      }
    }
    grouped.set(key, existing);
  }
  return [...grouped.values()]
    .map((event) => ({
      ...event,
      right_notes: unique_numbers(event.right_notes),
      left_notes: unique_numbers(event.left_notes),
      right_fingerings: unique_fingerings(event.right_fingerings),
      left_fingerings: unique_fingerings(event.left_fingerings),
      ...(event.right_slur ? { right_slur: event.right_slur } : {}),
      ...(event.left_slur ? { left_slur: event.left_slur } : {}),
    }))
    .sort((a, b) => a.onset_beats - b.onset_beats || a.duration_beats - b.duration_beats);
}

function normalize_jianpu_slur(value) {
  return ["start", "continue", "stop"].includes(value) ? value : undefined;
}

function merge_jianpu_slur(current, next) {
  if (!next) {
    return current;
  }
  return current ?? next;
}

export function score_document_to_musicxml(document, event_metadata = {}) {
  const time = parse_time_signature(document.time_signature);
  const divisions = 16;
  const slur_entries_by_event_id = build_musicxml_slur_entries(
    document,
    event_metadata,
  );
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="4.0">',
    "  <identification>",
    "    <encoding>",
    "      <software>Panio calibration</software>",
    `      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>`,
    "    </encoding>",
    "  </identification>",
    "  <part-list>",
    '    <score-part id="P1">',
    "      <part-name>Piano</part-name>",
    "    </score-part>",
    "  </part-list>",
    '  <part id="P1">',
  ];
  let previous_time;
  let previous_fifths;
  for (const [measure_index, measure] of document.measures.entries()) {
    lines.push(`    <measure number="${xml_escape(measure.number || String(measure_index + 1))}">`);
    const measure_time = parse_measure_meter(measure.meter, time);
    const measure_fifths = key_signature_to_fifths(
      measure.key_signature ?? document.key_signature,
      measure.tonic_midi ?? document.tonic_midi,
    );
    const time_changed = !previous_time ||
      previous_time.beats !== measure_time.beats ||
      previous_time.beat_unit !== measure_time.beat_unit;
    const key_changed = previous_fifths === undefined ||
      previous_fifths !== measure_fifths;
    if (measure_index === 0 || time_changed || key_changed) {
      lines.push("      <attributes>");
      if (measure_index === 0) {
        lines.push(`        <divisions>${divisions}</divisions>`);
      }
      if (key_changed) {
        lines.push("        <key>");
        lines.push(`          <fifths>${measure_fifths}</fifths>`);
        lines.push("        </key>");
      }
      if (time_changed) {
        lines.push("        <time>");
        lines.push(`          <beats>${measure_time.beats}</beats>`);
        lines.push(`          <beat-type>${measure_time.beat_unit}</beat-type>`);
        lines.push("        </time>");
      }
      if (measure_index === 0) {
        lines.push("        <staves>2</staves>");
        for (const staff_number of [1, 2]) {
          const clef = musicxml_clef_for_staff();
          lines.push(`        <clef number="${staff_number}">`);
          lines.push(`          <sign>${clef.sign}</sign>`);
          lines.push(`          <line>${clef.line}</line>`);
          lines.push("        </clef>");
        }
      }
      lines.push("      </attributes>");
    }
    previous_time = measure_time;
    previous_fifths = measure_fifths;

    const events_by_staff = new Map();
    for (const event of measure.events) {
      const staff = musicxml_staff_for_event(event);
      const list = events_by_staff.get(staff) ?? [];
      list.push(event);
      events_by_staff.set(staff, list);
    }
    const sorted_staffs = [...events_by_staff.keys()].sort((a, b) => a - b);
    for (const [staff_index, staff] of sorted_staffs.entries()) {
      if (staff_index > 0) {
        lines.push("      <backup>");
        lines.push(`        <duration>${Math.round(measure_time.beats * divisions)}</duration>`);
        lines.push("      </backup>");
      }
      for (const event of events_by_staff.get(staff).sort((a, b) =>
        a.onset_beats - b.onset_beats || a.duration_beats - b.duration_beats)) {
        lines.push(...score_event_to_musicxml_notes(
          event,
          staff,
          divisions,
          event_metadata[event.id],
          slur_entries_by_event_id.get(event.id) ?? [],
        ));
      }
    }
    lines.push("    </measure>");
  }
  lines.push("  </part>");
  lines.push("</score-partwise>");
  return `${lines.join("\n")}\n`;
}

function score_event_to_musicxml_notes(
  event,
  staff,
  divisions,
  metadata,
  slur_entries = [],
) {
  const duration = Math.max(1, Math.round(Number(event.duration_beats) * divisions));
  const notes = event.notes.length > 0 ? event.notes : [undefined];
  return notes.flatMap((note, note_index) => {
    const lines = [
      ...musicxml_event_directions(event, metadata, note_index),
      "      <note>",
    ];
    if (note_index > 0) {
      lines.push("        <chord/>");
    }
    if (!note) {
      lines.push("        <rest/>");
    } else {
      const pitch = midi_to_musicxml_pitch(note.midi);
      lines.push("        <pitch>");
      lines.push(`          <step>${pitch.step}</step>`);
      if (pitch.alter !== 0) {
        lines.push(`          <alter>${pitch.alter}</alter>`);
      }
      lines.push(`          <octave>${pitch.octave}</octave>`);
      lines.push("        </pitch>");
    }
    for (const tie_type of note ? musicxml_tie_types(event.tie) : []) {
      lines.push(`        <tie type="${tie_type}"/>`);
    }
    lines.push(`        <duration>${duration}</duration>`);
    lines.push(`        <voice>${event.voice ?? staff}</voice>`);
    lines.push(`        <type>${duration_to_musicxml_type(event.duration_beats)}</type>`);
    lines.push(`        <staff>${staff}</staff>`);
    lines.push(...musicxml_notations(event, note, note_index, metadata, slur_entries));
    lines.push("      </note>");
    return lines;
  });
}

function musicxml_event_directions(event, metadata, note_index) {
  if (note_index > 0) {
    return [];
  }
  const direction_types = [];
  const dynamics = String(metadata?.dynamics ?? "").trim();
  if (dynamics) {
    direction_types.push(
      "          <dynamics>",
      `            <${xml_name(dynamics)}/>`,
      "          </dynamics>",
    );
  }
  const wedge = normalize_musicxml_relation(
    metadata?.wedge,
    ["crescendo", "diminuendo", "stop"],
  );
  if (wedge) {
    direction_types.push(`          <wedge type="${wedge}"/>`);
  }
  const pedal = normalize_musicxml_relation(
    metadata?.pedal,
    ["start", "stop", "change", "continue"],
  );
  if (pedal) {
    direction_types.push(`          <pedal type="${pedal}"/>`);
  }
  const words = String(metadata?.words ?? "").trim();
  if (words) {
    direction_types.push(`          <words>${xml_escape(words)}</words>`);
  }
  return direction_types.length === 0
    ? []
    : [
        '      <direction placement="below">',
        "        <direction-type>",
        ...direction_types,
        "        </direction-type>",
        `        <staff>${musicxml_staff_for_event(event)}</staff>`,
        "      </direction>",
      ];
}

function musicxml_notations(event, note, note_index, metadata, slur_entries = []) {
  const slurs = note_index === 0 ? slur_entries : [];
  const articulation = note_index === 0
    ? normalize_musicxml_articulation(metadata?.articulation)
    : undefined;
  const fermata = note_index === 0
    ? normalize_musicxml_relation(metadata?.fermata, ["upright", "inverted"])
    : undefined;
  const ornament = note_index === 0
    ? normalize_musicxml_ornament(metadata?.ornament)
    : undefined;
  const tie_types = note ? musicxml_tie_types(event.tie) : [];
  if (
    !note?.finger &&
    slurs.length === 0 &&
    !articulation &&
    !fermata &&
    !ornament &&
    tie_types.length === 0
  ) {
    return [];
  }
  const lines = ["        <notations>"];
  for (const tie_type of tie_types) {
    lines.push(`          <tied type="${tie_type}"/>`);
  }
  if (note?.finger) {
    lines.push("          <technical>");
    lines.push(`            <fingering>${note.finger}</fingering>`);
    lines.push("          </technical>");
  }
  if (articulation) {
    lines.push("          <articulations>");
    lines.push(`            <${articulation}/>`);
    lines.push("          </articulations>");
  }
  if (fermata) {
    lines.push(`          <fermata type="${fermata}"/>`);
  }
  if (ornament) {
    lines.push("          <ornaments>");
    lines.push(`            <${ornament}/>`);
    lines.push("          </ornaments>");
  }
  for (const slur of slurs) {
    lines.push(`          <slur type="${slur.type}" number="${slur.number}"/>`);
  }
  lines.push("        </notations>");
  return lines;
}

function build_musicxml_slur_entries(document, event_metadata) {
  const result = new Map();
  const active_by_hand = new Map();
  const active_numbers = new Set();
  for (const event of ordered_document_events(document)) {
    if (!Array.isArray(event.notes) || event.notes.length === 0) {
      continue;
    }
    const slur = event_metadata[event.id]?.slur;
    if (!slur || slur === "none" || slur === "continue") {
      continue;
    }
    const active = active_by_hand.get(event.hand) ?? [];
    if (slur === "start") {
      const number = next_available_slur_number(active_numbers);
      active.push(number);
      active_numbers.add(number);
      active_by_hand.set(event.hand, active);
      result.set(event.id, [{ type: "start", number }]);
      continue;
    }
    const number = active.pop();
    if (number !== undefined) {
      active_numbers.delete(number);
      result.set(event.id, [{ type: "stop", number }]);
    }
    if (active.length > 0) {
      active_by_hand.set(event.hand, active);
    } else {
      active_by_hand.delete(event.hand);
    }
  }
  return result;
}

function next_available_slur_number(active_numbers) {
  let number = 1;
  while (active_numbers.has(number)) {
    number += 1;
  }
  return number;
}

function ordered_document_events(document) {
  return document.measures.flatMap((measure, measure_index) =>
    measure.events.map((event) => ({ event, measure_index })))
    .sort((left, right) =>
      left.measure_index - right.measure_index ||
      left.event.onset_beats - right.event.onset_beats ||
      event_voice(left.event) - event_voice(right.event))
    .map((entry) => entry.event);
}

function event_voice(event) {
  return event.voice ?? (event.hand === "left" ? 2 : 1);
}

function normalize_musicxml_relation(value, allowed) {
  const normalized = String(value ?? "").trim();
  return allowed.includes(normalized) ? normalized : undefined;
}

function normalize_musicxml_ornament(value) {
  const normalized = String(value ?? "").trim();
  return [
    "trill-mark",
    "turn",
    "inverted-turn",
    "mordent",
    "inverted-mordent",
  ].includes(normalized)
    ? normalized
    : undefined;
}

function musicxml_tie_types(tie) {
  if (tie === "start") {
    return ["start"];
  }
  if (tie === "stop") {
    return ["stop"];
  }
  if (tie === "continue") {
    return ["stop", "start"];
  }
  return [];
}

function parse_time_signature(value) {
  const match = /^(\d+)\s*\/\s*(\d+)/.exec(String(value ?? ""));
  return {
    beats: match ? Number(match[1]) : 4,
    beat_unit: match ? Number(match[2]) : 4,
  };
}

function parse_measure_meter(meter, fallback) {
  return {
    beats: Number.isFinite(meter?.beats) ? Number(meter.beats) : fallback.beats,
    beat_unit: Number.isFinite(meter?.beat_unit) ? Number(meter.beat_unit) : fallback.beat_unit,
  };
}

function musicxml_staff_for_event(event) {
  return event.hand === "left" ? 2 : 1;
}

function musicxml_clef_for_staff() {
  return { sign: "G", line: 2 };
}

function midi_to_musicxml_pitch(midi) {
  const pitch_classes = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const normalized_midi = Number(midi);
  const pitch = pitch_classes[((normalized_midi % 12) + 12) % 12];
  return {
    ...pitch,
    octave: Math.floor(normalized_midi / 12) - 1,
  };
}

function duration_to_musicxml_type(duration_beats) {
  if (duration_beats >= 4) {
    return "whole";
  }
  if (duration_beats >= 2) {
    return "half";
  }
  if (duration_beats >= 1) {
    return "quarter";
  }
  if (duration_beats >= 0.5) {
    return "eighth";
  }
  return "16th";
}

function key_signature_to_fifths(key_signature, tonic_midi) {
  const normalized = String(key_signature ?? "").trim().toLowerCase();
  const tonic = /^([a-g])\s*([#♯b♭]?)/.exec(normalized);
  if (tonic) {
    const name = `${tonic[1]}${tonic[2].replace("♯", "#").replace("♭", "b")}`;
    const minor = normalized.includes("minor") || normalized.includes("小调");
    const fifths_by_key = minor
      ? new Map([
          ["ab", -7], ["eb", -6], ["bb", -5], ["f", -4],
          ["c", -3], ["g", -2], ["d", -1], ["a", 0],
          ["e", 1], ["b", 2], ["f#", 3], ["c#", 4],
          ["g#", 5], ["d#", 6], ["a#", 7],
        ])
      : new Map([
          ["cb", -7], ["gb", -6], ["db", -5], ["ab", -4],
          ["eb", -3], ["bb", -2], ["f", -1], ["c", 0],
          ["g", 1], ["d", 2], ["a", 3], ["e", 4],
          ["b", 5], ["f#", 6], ["c#", 7],
        ]);
    const fifths = fifths_by_key.get(name);
    if (fifths !== undefined) {
      return fifths;
    }
  }
  const major_fifths_by_tonic = new Map([
    [0, 0],
    [7, 1],
    [2, 2],
    [9, 3],
    [4, 4],
    [11, 5],
    [6, 6],
    [1, 7],
    [5, -1],
    [10, -2],
    [3, -3],
    [8, -4],
  ]);
  return major_fifths_by_tonic.get(((Number(tonic_midi) % 12) + 12) % 12) ?? 0;
}

function normalize_musicxml_articulation(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (["staccato", "accent", "tenuto", "strong-accent", "detached-legato"].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

function xml_name(value) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9-]/g, "");
  return normalized || "mf";
}

function xml_escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function round_score_number(value) {
  return Math.round(Number(value) * 10_000) / 10_000;
}

function unique_numbers(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function unique_fingerings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value.note);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function serialize_curriculum_bundle(bundle) {
  return {
    id: bundle.curriculum.id,
    slug: bundle.curriculum.slug,
    title: bundle.curriculum.title,
    status: bundle.curriculum.status,
    active_revision_id: bundle.curriculum.active_revision_id,
    revision: serialize_curriculum_revision(bundle.revision),
    nodes: bundle.nodes.map(serialize_curriculum_node),
    lesson_score_bindings: (bundle.bindings ?? []).map(
      serialize_lesson_score_binding,
    ),
    score_versions: (bundle.score_versions ?? [])
      .filter((version) => Boolean(version.published_at))
      .map(serialize_score_version),
  };
}

function serialize_curriculum_revision(revision) {
  return {
    id: revision.id,
    curriculum_id: revision.curriculum_id,
    version_number: revision.version_number,
    status: revision.status,
    title: revision.title,
    description: revision.description,
    published_at: revision.published_at,
  };
}

function serialize_curriculum_node(node) {
  return {
    id: node.id,
    revision_id: node.revision_id,
    parent_id: node.parent_id,
    kind: node.kind,
    title: node.title,
    position: node.position,
    payload: node.payload,
    status: node.status,
    updated_at: node.updated_at,
  };
}

function serialize_lesson_score_binding(binding) {
  return {
    id: binding.id,
    lesson_node_id: binding.lesson_node_id,
    score_version_id: binding.score_version_id,
    role: binding.role,
    position: binding.position,
    settings: binding.settings,
  };
}

function serialize_score(score) {
  return {
    id: score.id,
    slug: score.slug,
    title: score.title,
    status: score.status,
    metadata: score.metadata,
    current_version_id: score.current_version_id,
    created_at: score.created_at,
    updated_at: score.updated_at,
    versions: score.versions.map(serialize_score_version),
    drafts: score.drafts.map(serialize_score_draft),
  };
}

function serialize_score_version(version) {
  return {
    id: version.id,
    score_id: version.score_id,
    version_number: version.version_number,
    source_sha256: version.source_sha256,
    document: version.document,
    hymn_review: version.hymn_review,
    created_at: version.created_at,
    published_at: version.published_at,
  };
}

function serialize_score_draft(draft) {
  return {
    id: draft.id,
    score_id: draft.score_id,
    base_version_id: draft.base_version_id,
    document: draft.document,
    hymn_review: draft.hymn_review,
    updated_at: draft.updated_at,
  };
}

function serialize_score_calibration(calibration) {
  return {
    id: calibration.id,
    material_id: calibration.material_id,
    segment_id: calibration.segment_id,
    project: calibration.project,
    validation: calibration.validation,
    original_data_path: calibration.original_data_path,
    original_data_sha256: calibration.original_data_sha256,
    sync_state: calibration.sync_state,
    updated_at: calibration.updated_at,
  };
}

function serialize_material_deletion(deletion) {
  return {
    material_id: deletion.material_id,
    segment_id: deletion.segment_id,
    deletion_status: deletion.deletion_status,
    deleted_by: deletion.deleted_by,
    deleted_at: deletion.deleted_at,
    updated_at: deletion.updated_at,
  };
}

function apply_material_segment_deletions(catalog, deletions) {
  const deleted_segments = new Set(
    deletions.map((deletion) => `${deletion.material_id}:${deletion.segment_id}`),
  );
  return {
    ...catalog,
    materials: (catalog.materials ?? [])
      .map((material) => {
        const segments = (material.segments ?? [])
          .filter((segment) =>
            segment.deletion_status !== "deleted" &&
            !deleted_segments.has(`${material.id}:${segment.id}`))
          .map((segment) => ({
            ...segment,
            deletion_status: "active",
          }));
        const next_material = {
          ...material,
          segments,
        };
        if ("segment_count" in material) {
          next_material.segment_count = segments.length;
        }
        return next_material;
      })
      .filter((material) => material.segments.length > 0),
  };
}

function material_segment_exists(material_catalog, jianpu_catalog, material_id, segment_id) {
  return [material_catalog, jianpu_catalog].some((catalog) =>
    (catalog.materials ?? []).some((material) =>
      material.id === material_id &&
      (material.segments ?? []).some((segment) =>
        segment.id === segment_id && segment.deletion_status !== "deleted")));
}

function serialize_content(content, include_unpublished = false) {
  return {
    id: content.id,
    kind: content.kind,
    title: content.title,
    status: content.status,
    metadata: content.metadata,
    current_version_id: content.current_version_id,
    created_at: content.created_at,
    updated_at: content.updated_at,
    versions: content.versions
      .filter((version) =>
        include_unpublished || version.published_at || content.status !== "published")
      .map(serialize_version),
  };
}

function serialize_version(version) {
  return {
    id: version.id,
    content_id: version.content_id,
    version_number: version.version_number,
    source_sha256: version.source_sha256,
    created_at: version.created_at,
    published_at: version.published_at,
    musicxml_url:
      `/api/v1/content/${version.content_id}/versions/${version.id}/musicxml`,
    practice_data_url: version.practice_data_path
      ? `/api/v1/content/${version.content_id}/versions/${version.id}/practice-data`
      : undefined,
  };
}

function handle_static_request(request, response, url, request_id, static_root) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    send_error(
      response,
      405,
      "method_not_allowed",
      "静态资源仅接受 GET 或 HEAD。",
      request_id,
    );
    return;
  }

  const requested_path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file_path = resolve_static_path(static_root, requested_path);
  if (!file_path) {
    send_error(response, 400, "bad_path", "资源地址无效。", request_id);
    return;
  }
  if (!is_regular_file(file_path)) {
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/materials/")) {
      send_error(response, 404, "not_found", "资源不存在。", request_id);
      return;
    }
    serve_file(request, response, resolve(static_root, "index.html"));
    return;
  }
  serve_file(request, response, file_path);
}

function serve_file(request, response, file_path) {
  const extension = extname(file_path).toLowerCase();
  const is_html = extension === ".html";
  response.statusCode = 200;
  response.setHeader("Content-Type", content_types[extension] ?? "application/octet-stream");
  response.setHeader(
    "Cache-Control",
    is_html
      ? "no-cache"
      : file_path.includes("/assets/")
        ? "public, max-age=604800, immutable"
        : "public, max-age=3600",
  );
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(file_path);
  stream.on("error", () => {
    if (!response.headersSent) {
      send_json(response, 500, {
        error: "read_failed",
        message: "资源读取失败。",
      });
    } else {
      response.destroy();
    }
  });
  stream.pipe(response);
}

export function send_json(response, status, body, head_only = false) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(head_only ? undefined : JSON.stringify(body));
}

function send_error(response, status, error, message, request_id) {
  send_json(response, status, { error, message, request_id });
}

function set_headers(response, headers) {
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
}

function set_rate_headers(response, limit, rate) {
  response.setHeader("RateLimit-Limit", String(limit));
  response.setHeader("RateLimit-Remaining", String(rate.remaining));
}

function get_client_id(request, trust_proxy) {
  if (trust_proxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const first_address = forwarded.split(",", 1)[0].trim();
      if (first_address) {
        return first_address.slice(0, 128);
      }
    }
  }
  return request.socket.remoteAddress ?? "unknown";
}

function is_write_method(method) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function is_regular_file(file_path) {
  try {
    return statSync(file_path).isFile();
  } catch {
    return false;
  }
}

function default_logger(event) {
  console.log(JSON.stringify(event));
}

const content_types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".midi": "audio/midi",
  ".mid": "audio/midi",
  ".musicxml": "application/vnd.recordare.musicxml+xml; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};
