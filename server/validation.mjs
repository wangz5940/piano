const email_pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const self_registration_roles = new Set(["student", "parent"]);
const input_sources = new Set([
  "midi",
  "keyboard",
  "microphone",
  "virtual_piano",
  "manual",
]);
const content_kinds = new Set(["material", "course", "exercise", "piece"]);
const editable_roles = new Set(["student", "parent", "teacher"]);
const score_document_statuses = new Set([
  "candidate",
  "needs_review",
  "reviewed",
  "published",
]);
const score_annotation_sources = new Set(["pptx", "generated", "manual", "legacy"]);
const score_annotation_statuses = new Set([
  "candidate",
  "needs_review",
  "confirmed",
  "published",
  "rejected",
]);
const score_provenance_kinds = new Set(["pptx", "manual", "legacy"]);
const score_hand_position_movements = new Set(["stay", "move", "return"]);
const score_ties = new Set(["start", "continue", "stop"]);
const hymn_review_states = new Set(["candidate", "needs_review", "reviewed"]);
const hymn_review_issue_kinds = new Set([
  "unknown_glyph",
  "structural",
  "source",
  "other",
]);
const hymn_review_issue_severities = new Set(["warning", "error"]);
const hymn_review_issue_statuses = new Set(["unresolved", "resolved"]);
const sha256_pattern = /^[a-f0-9]{64}$/i;
const calibration_fields = [
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
];
const default_primary_calibration_fields = [
  "pitch_name",
  "duration",
  "fingering",
  "hand",
];

export class validation_error extends Error {
  constructor(message, status = 400, code = "invalid_request") {
    super(message);
    this.name = "validation_error";
    this.status = status;
    this.code = code;
  }
}

export async function read_json_body(request, max_bytes = 256 * 1_024) {
  const content_type = String(request.headers["content-type"] ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (content_type !== "application/json") {
    throw new validation_error("请求必须使用 application/json", 415, "unsupported_media_type");
  }

  const declared_length = Number(request.headers["content-length"]);
  if (Number.isFinite(declared_length) && declared_length > max_bytes) {
    throw new validation_error("请求内容过大", 413, "payload_too_large");
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > max_bytes) {
      throw new validation_error("请求内容过大", 413, "payload_too_large");
    }
    chunks.push(chunk);
  }

  try {
    return as_record(JSON.parse(Buffer.concat(chunks).toString("utf8")), "请求内容必须是 JSON 对象");
  } catch (error) {
    if (error instanceof validation_error) {
      throw error;
    }
    throw new validation_error("JSON 格式无效");
  }
}

export function validate_registration(value) {
  const email = normalize_email(value.email);
  const display_name = required_string(value.display_name, "显示名称", 1, 40);
  const password = required_string(value.password, "密码", 10, 128, false);
  const role = value.role === undefined ? "student" : String(value.role);
  if (!self_registration_roles.has(role)) {
    throw new validation_error("自助注册只能选择学生或家长身份");
  }
  return { email, display_name, password, role };
}

export function validate_login(value) {
  return {
    email: normalize_email(value.email),
    password: required_string(value.password, "密码", 1, 128, false),
  };
}

export function validate_account_deletion(value) {
  return {
    password: required_string(value.password, "密码", 1, 128, false),
  };
}

export function validate_snapshot(value) {
  const base_revision = nonnegative_integer(value.base_revision, "同步版本");
  const merge_local = value.merge_local === true;
  const progress = validate_progress(value.progress);
  const preferences = validate_preferences(value.preferences);
  return { base_revision, merge_local, progress, preferences };
}

export function validate_practice_session(value) {
  const lesson_id = identifier(value.lesson_id, "课程 ID");
  const input_source = String(value.input_source ?? "");
  if (!input_sources.has(input_source)) {
    throw new validation_error("练习输入来源无效");
  }
  const started_at = timestamp(value.started_at, "开始时间");
  const completed_at = timestamp(value.completed_at, "完成时间");
  if (completed_at < started_at) {
    throw new validation_error("完成时间不能早于开始时间");
  }
  const duration_ms = bounded_integer(
    value.duration_ms ?? completed_at - started_at,
    "练习时长",
    0,
    24 * 60 * 60 * 1_000,
  );
  return {
    client_result_id: value.client_result_id === undefined
      ? `${lesson_id}:${started_at}:${completed_at}`
      : identifier(value.client_result_id, "练习结果 ID"),
    lesson_id,
    content_version_id: optional_identifier(value.content_version_id, "内容版本 ID"),
    input_source,
    started_at,
    completed_at,
    duration_ms,
    bpm: value.bpm === undefined ? undefined : bounded_integer(value.bpm, "速度", 20, 300),
    last_measure_index: value.last_measure_index === undefined
      ? undefined
      : bounded_integer(value.last_measure_index, "断点小节", 0, 20_000),
    accuracy: ratio(value.accuracy, "正确率"),
    rhythm_accuracy: value.rhythm_accuracy === undefined
      ? undefined
      : ratio(value.rhythm_accuracy, "节奏稳定度"),
    mistakes: bounded_integer(value.mistakes ?? 0, "错音数", 0, 1_000_000),
    early_steps: bounded_integer(value.early_steps ?? 0, "提前次数", 0, 1_000_000),
    late_steps: bounded_integer(value.late_steps ?? 0, "延后次数", 0, 1_000_000),
    metrics: validate_metrics(value.metrics),
  };
}

export function validate_practice_sessions_batch(value) {
  const sessions = value.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0 || sessions.length > 500) {
    throw new validation_error("每批练习结果数量必须在 1—500 条之间");
  }
  return sessions.map((session) =>
    validate_practice_session(as_record(session, "练习结果必须是对象")));
}

export function validate_content_create(value) {
  const kind = String(value.kind ?? "");
  if (!content_kinds.has(kind)) {
    throw new validation_error("内容种类无效");
  }
  return {
    kind,
    title: required_string(value.title, "标题", 1, 120),
    metadata: validate_content_metadata(value.metadata),
  };
}

export function validate_content_update(value) {
  if (value.title === undefined && value.metadata === undefined) {
    throw new validation_error("没有可更新的内容");
  }
  return {
    title: value.title === undefined
      ? undefined
      : required_string(value.title, "标题", 1, 120),
    metadata: value.metadata === undefined
      ? undefined
      : validate_content_metadata(value.metadata),
  };
}

export function validate_content_version(value, source_sha256) {
  const musicxml_text = required_string(
    value.musicxml_text,
    "MusicXML",
    32,
    3_500_000,
    false,
  );
  if (!/<score-(?:partwise|timewise)\b/i.test(musicxml_text)) {
    throw new validation_error("MusicXML 缺少有效的 score 根元素");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(musicxml_text)) {
    throw new validation_error("MusicXML 不能包含外部实体或文档类型声明");
  }

  let practice_data;
  if (value.practice_data !== undefined && value.practice_data !== null) {
    practice_data = as_record(value.practice_data, "跟弹数据必须是 JSON 对象");
    if (practice_data.source_sha256 !== source_sha256) {
      throw new validation_error("跟弹数据与当前 MusicXML 版本不一致");
    }
    if (!Array.isArray(practice_data.events) || practice_data.events.length === 0) {
      throw new validation_error("跟弹数据必须包含非空 events");
    }
    if (practice_data.events.length > 50_000) {
      throw new validation_error("跟弹事件数量过多");
    }
  }
  return { musicxml_text, practice_data };
}

export function validate_role_update(value) {
  const role = String(value.role ?? "");
  if (!editable_roles.has(role)) {
    throw new validation_error("网页后台只能设置学生、家长或老师身份");
  }
  return { role };
}

export function validate_publish(value) {
  return { version_id: identifier(value.version_id, "内容版本 ID") };
}

export function validate_curriculum_node_move(value) {
  return {
    parent_id: optional_identifier(value.parent_id, "父节点 ID"),
    position: bounded_integer(value.position, "排序位置", 1, 10_000),
  };
}

export function validate_curriculum_revision_create(value) {
  const input = as_record(value, "课程修订内容必须是对象");
  return {
    base_revision_id: optional_identifier(
      input.base_revision_id,
      "基础课程修订 ID",
    ),
  };
}

export function validate_lesson_score_binding(value) {
  const input = as_record(value, "课程乐谱绑定必须是对象");
  return {
    score_version_id: identifier(input.score_version_id, "乐谱版本 ID"),
    role: valid_set_value(
      input.role ?? "primary",
      new Set(["primary", "reference", "practice_events"]),
      "绑定角色",
    ),
    position: bounded_integer(input.position ?? 1, "绑定顺序", 1, 100),
    settings: input.settings === undefined
      ? {}
      : structuredClone(as_record(input.settings, "绑定设置必须是对象")),
  };
}

export function validate_score_draft_create(value) {
  return {
    base_version_id: optional_identifier(value.base_version_id, "基础版本 ID"),
  };
}

export function validate_hymn_candidate_create(value) {
  const candidate = as_record(value, "诗歌候选必须是对象");
  const score = as_record(candidate.score, "诗歌候选缺少乐谱信息");
  const document = candidate.document;
  validate_score_document(document);
  const score_id = identifier(score.id, "乐谱 ID");
  if (document.id !== score_id) {
    throw new validation_error("候选乐谱 ID 与 ScoreDocument 不一致");
  }
  if (document.provenance.kind !== "pptx") {
    throw new validation_error("诗歌候选必须具有 PPTX 来源");
  }
  if (document.status === "published") {
    throw new validation_error("不能把已发布文档创建为候选");
  }
  return {
    score: {
      id: score_id,
      slug: identifier(score.slug, "乐谱 slug"),
      title: required_string(score.title, "乐谱标题", 1, 200),
    },
    document: structuredClone(document),
    review: validate_hymn_review_create(candidate.review),
  };
}

export function validate_score_draft_save(value) {
  const input = as_record(value, "乐谱草稿修订必须是对象");
  validate_score_document(input.document);
  return {
    document: structuredClone(input.document),
    review: validate_hymn_review_save(input.review),
  };
}

export function validate_score_calibration_save(value, options = {}) {
  const input = as_record(value, "校准保存内容必须是对象");
  const project = normalize_score_calibration_project(
    as_record(input.project, "校准项目必须是对象"),
    {
      published_by: options.published_by ?? "calibration-workbench",
      published_at: options.published_at ?? new Date().toISOString(),
    },
  );
  const id = identifier(project.id, "校准项目 ID");
  const match = id.match(/^material:([A-Za-z0-9._:-]+):([A-Za-z0-9._:-]+)$/);
  if (!match) {
    throw new validation_error("校准项目必须来自教材谱库");
  }
  required_string(project.title, "校准项目标题", 1, 200);
  validate_calibration_material_catalog(project.material_catalog, match[1]);
  validate_score_document(project.document);
  if (!project.event_metadata || typeof project.event_metadata !== "object" ||
    Array.isArray(project.event_metadata)) {
    throw new validation_error("事件校准元数据必须是对象");
  }
  const levels = as_record(project.levels, "校准等级状态必须是对象");
  for (const level of ["L0", "L1", "L2", "L3"]) {
    const state = as_record(levels[level], `${level} 状态必须是对象`);
    valid_set_value(state.status, new Set(["pending", "in_progress", "passed"]), `${level} 状态`);
    nullable_iso_timestamp(state.confirmed_at, `${level} 确认时间`);
  }
  const validation = as_record(input.validation, "校验结果必须是对象");
  return {
    material_id: match[1],
    segment_id: match[2],
    project: structuredClone(project),
    validation: structuredClone(validation),
  };
}

function normalize_score_calibration_project(project, publication) {
  const next_project = structuredClone(project);
  const document = next_project.document;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return next_project;
  }
  document.status = "published";
  const review = document.review && typeof document.review === "object" &&
    !Array.isArray(document.review)
    ? document.review
    : {};
  document.review = {
    ...review,
    published_by: review.published_by ?? publication.published_by,
    published_at: review.published_at ?? publication.published_at,
  };
  for (const measure of document.measures ?? []) {
    for (const event of measure.events ?? []) {
      for (const note of event.notes ?? []) {
        if (note?.fingering && typeof note.fingering === "object") {
          note.fingering.status = "published";
          note.fingering.confirmed_by = null;
          note.fingering.confirmed_at = null;
        }
      }
    }
  }
  return next_project;
}

function validate_calibration_material_catalog(value, material_id) {
  if (value === undefined || value === null) {
    return;
  }
  const catalog = as_record(value, "教材目录校准信息必须是对象");
  const candidate_material_id = identifier(catalog.material_id, "教材 ID");
  if (candidate_material_id !== material_id) {
    throw new validation_error("教材目录校准信息与当前教材不一致");
  }
  required_string(catalog.title, "教材名称", 1, 200);
  if (!Array.isArray(catalog.chapters) || catalog.chapters.length > 2_000) {
    throw new validation_error("教材章节列表无效");
  }
  const chapter_ids = new Set();
  for (const raw_chapter of catalog.chapters) {
    const chapter = as_record(raw_chapter, "教材章节必须是对象");
    const chapter_id = identifier(chapter.id, "章节 ID");
    if (chapter_ids.has(chapter_id)) {
      throw new validation_error("章节 ID 不能重复");
    }
    chapter_ids.add(chapter_id);
    required_string(chapter.title, "章节名", 1, 200);
    optional_string(chapter.description, 1_000);
    bounded_integer(chapter.page_start, "章节起始页", 0, 100_000);
    bounded_integer(chapter.page_end, "章节结束页", 0, 100_000);
    if (chapter.page_end < chapter.page_start) {
      throw new validation_error("章节结束页不能早于起始页");
    }
  }
}

export function validate_score_event_patch(value) {
  const patch = as_record(value, "乐谱编辑内容必须是对象");
  const result = {
    note_id: optional_identifier(patch.note_id, "音符 ID"),
    midi: patch.midi === undefined
      ? undefined
      : bounded_integer(patch.midi, "音高", 21, 108),
    finger: patch.finger === null
      ? null
      : patch.finger === undefined
        ? undefined
        : bounded_integer(patch.finger, "指法", 1, 5),
    onset_beats: patch.onset_beats === undefined
      ? undefined
      : bounded_number(patch.onset_beats, "起拍", 0, 128),
    duration_beats: patch.duration_beats === undefined
      ? undefined
      : bounded_number(patch.duration_beats, "时值", 0.0625, 128),
    hand: patch.hand === undefined
      ? undefined
      : valid_set_value(patch.hand, new Set(["left", "right"]), "手别"),
    chord: patch.chord === undefined
      ? undefined
      : optional_string(patch.chord, 40) ?? "",
    fingering_reason: patch.fingering_reason === undefined
      ? undefined
      : required_string(patch.fingering_reason, "指法依据", 1, 500),
    chord_reason: patch.chord_reason === undefined
      ? undefined
      : required_string(patch.chord_reason, "和弦依据", 1, 500),
  };
  if (Object.values(result).every((item) => item === undefined)) {
    throw new validation_error("没有可更新的乐谱字段");
  }
  if (
    result.note_id === undefined &&
    (
      result.midi !== undefined ||
      result.finger !== undefined ||
      result.fingering_reason !== undefined
    )
  ) {
    throw new validation_error("修改音高或指法时必须提供音符 ID");
  }
  return result;
}

function validate_hymn_review_create(value) {
  const review = as_record(value, "诗歌校对信息必须是对象");
  if (!Array.isArray(review.slides) || review.slides.length === 0 || review.slides.length > 100) {
    throw new validation_error("诗歌校对必须包含 1—100 张 SVG 幻灯片");
  }
  const slide_numbers = new Set();
  const slides = review.slides.map((raw_slide) => {
    const slide = as_record(raw_slide, "诗歌 SVG 幻灯片必须是对象");
    const slide_number = bounded_integer(slide.slide_number, "幻灯片序号", 1, 100_000);
    if (slide_numbers.has(slide_number)) {
      throw new validation_error("诗歌 SVG 幻灯片序号不能重复");
    }
    slide_numbers.add(slide_number);
    return {
      slide_number,
      source_svg: validate_svg(
        slide.source_svg,
        "来源忠实 SVG",
        "pptx-source-svg",
      ),
      normalized_svg: validate_svg(
        slide.normalized_svg,
        "规范教学 SVG",
        "normalized-teaching-svg",
      ),
      source_refs: validate_score_source_references(
        slide.source_refs,
        "SVG 来源引用",
      ).map((reference) => structuredClone(reference)),
    };
  });
  return {
    review_state: valid_set_value(
      review.review_state,
      hymn_review_states,
      "诗歌审核状态",
    ),
    font_config_version: required_string(
      review.font_config_version,
      "字体配置版本",
      1,
      160,
    ),
    slides,
    issues: validate_hymn_review_issues(review.issues),
  };
}

function validate_hymn_review_save(value) {
  const review = as_record(value, "诗歌校对修订必须是对象");
  if (
    !Array.isArray(review.normalized_slides) ||
    review.normalized_slides.length === 0 ||
    review.normalized_slides.length > 100
  ) {
    throw new validation_error("规范教学预览必须包含 1—100 张幻灯片");
  }
  const slide_numbers = new Set();
  const normalized_slides = review.normalized_slides.map((raw_slide) => {
    const slide = as_record(raw_slide, "规范教学预览必须是对象");
    const slide_number = bounded_integer(slide.slide_number, "幻灯片序号", 1, 100_000);
    if (slide_numbers.has(slide_number)) {
      throw new validation_error("规范教学预览序号不能重复");
    }
    slide_numbers.add(slide_number);
    return {
      slide_number,
      svg: validate_svg(
        slide.svg,
        "规范教学 SVG",
        "normalized-teaching-svg",
      ),
    };
  });
  return {
    review_state: valid_set_value(
      review.review_state,
      new Set(["needs_review", "reviewed"]),
      "诗歌审核状态",
    ),
    issues: validate_hymn_review_issues(review.issues),
    normalized_slides,
  };
}

function validate_hymn_review_issues(value) {
  if (!Array.isArray(value) || value.length > 100_000) {
    throw new validation_error("诗歌问题清单无效");
  }
  const issue_ids = new Set();
  return value.map((raw_issue) => {
    const issue = as_record(raw_issue, "诗歌问题必须是对象");
    const id = identifier(issue.id, "问题 ID");
    if (issue_ids.has(id)) {
      throw new validation_error("诗歌问题 ID 不能重复");
    }
    issue_ids.add(id);
    return {
      id,
      code: identifier(issue.code, "问题代码"),
      kind: valid_set_value(issue.kind, hymn_review_issue_kinds, "问题类型"),
      severity: valid_set_value(
        issue.severity,
        hymn_review_issue_severities,
        "问题严重度",
      ),
      status: valid_set_value(issue.status, hymn_review_issue_statuses, "问题状态"),
      message: required_string(issue.message, "问题说明", 1, 2_000),
      source_refs: validate_score_source_references(
        issue.source_refs,
        "问题来源引用",
      ).map((reference) => structuredClone(reference)),
    };
  });
}

function validate_svg(value, label, document_type) {
  const svg = required_string(value, label, 16, 2_000_000, false);
  if (!/^\s*<svg[\s>]/iu.test(svg) || !svg.includes(`data-document-type="${document_type}"`)) {
    throw new validation_error(`${label}类型无效`);
  }
  if (/<script|<foreignObject|\son[a-z]+\s*=/iu.test(svg)) {
    throw new validation_error(`${label}包含不安全内容`);
  }
  return svg;
}

export function validate_score_document(value, { for_publish = false } = {}) {
  const document = as_record(value, "ScoreDocument 必须是对象");
  if (document.schema_version !== 2) {
    throw new validation_error("ScoreDocument 版本必须为 v2");
  }
  identifier(document.id, "乐谱 ID");
  nullable_string(document.number, "乐谱编号", 40);
  required_string(document.title, "乐谱标题", 1, 200);
  required_string(document.key_signature, "调号", 1, 80);
  bounded_integer(document.tonic_midi, "主音", 0, 127);
  required_string(document.time_signature, "拍号", 1, 20);
  valid_set_value(document.status, score_document_statuses, "乐谱状态");
  validate_score_provenance(document.provenance);

  if (!Array.isArray(document.measures) || document.measures.length === 0) {
    throw new validation_error("乐谱至少需要一个小节");
  }
  if (document.measures.length > 20_000) {
    throw new validation_error("乐谱小节数量过多");
  }

  const measure_contexts = new Map();
  const event_ids = new Set();
  const note_ids = new Set();
  const annotations = [];
  document.measures.forEach((raw_measure, measure_index) => {
    const measure = as_record(raw_measure, "小节必须是对象");
    const measure_id = identifier(measure.id, "小节 ID");
    if (measure_contexts.has(measure_id)) {
      throw new validation_error("小节 ID 不能重复");
    }
    required_string(measure.number, "小节编号", 1, 40);
    const meter = as_record(measure.meter, "小节拍号必须是对象");
    const beats = bounded_number(meter.beats, "小节拍数", 0.0625, 128);
    bounded_integer(meter.beat_unit, "拍号单位", 1, 128);
    measure_contexts.set(measure_id, { index: measure_index, beats });
    if (!Array.isArray(measure.events) || measure.events.length > 50_000) {
      throw new validation_error("小节事件无效");
    }
    for (const raw_event of measure.events) {
      const event = as_record(raw_event, "乐谱事件必须是对象");
      const event_id = identifier(event.id, "事件 ID");
      if (event_ids.has(event_id)) {
        throw new validation_error("事件 ID 不能重复");
      }
      event_ids.add(event_id);
      const onset = bounded_number(event.onset_beats, "事件起拍", 0, beats);
      const duration = bounded_number(event.duration_beats, "事件时值", 0.0001, beats);
      if (onset + duration > beats + 0.0001) {
        throw new validation_error("事件时值超出小节");
      }
      valid_set_value(event.hand, new Set(["left", "right"]), "事件手别");
      bounded_integer(event.voice, "声部", 0, 128);
      if (!Array.isArray(event.notes) || event.notes.length > 128) {
        throw new validation_error("事件音符列表无效");
      }
      for (const raw_note of event.notes) {
        const note = as_record(raw_note, "音符必须是对象");
        const note_id = identifier(note.id, "音符 ID");
        if (note_ids.has(note_id)) {
          throw new validation_error("音符 ID 不能重复");
        }
        note_ids.add(note_id);
        bounded_integer(note.midi, "音高", 21, 108);
        if (note.finger !== undefined) {
          bounded_integer(note.finger, "指法", 1, 5);
          if (note.fingering === undefined) {
            throw new validation_error("v2 指法必须包含来源、状态和依据");
          }
        }
        if (note.fingering !== undefined) {
          if (note.finger === undefined) {
            throw new validation_error("指法说明缺少指法值");
          }
          annotations.push(validate_score_annotation(note.fingering, "指法说明"));
        }
        validate_score_source_references(note.source_refs ?? [], "音符来源引用");
      }
      if (event.chord !== undefined) {
        required_string(event.chord, "和弦", 1, 40);
        if (event.chord_annotation === undefined) {
          throw new validation_error("v2 和弦必须包含来源、状态和依据");
        }
      }
      if (event.chord_annotation !== undefined) {
        if (event.chord === undefined) {
          throw new validation_error("和弦说明缺少和弦值");
        }
        annotations.push(validate_score_annotation(event.chord_annotation, "和弦说明"));
      }
      if (event.tie !== undefined) {
        valid_set_value(event.tie, score_ties, "连音状态");
      }
      if (event.sustain !== undefined && typeof event.sustain !== "boolean") {
        throw new validation_error("延音状态无效");
      }
      validate_score_source_references(event.source_refs ?? [], "事件来源引用");
    }
  });

  const lyrics = validate_score_lyrics(document.lyrics, measure_contexts, event_ids);
  const hand_positions = validate_score_hand_positions(document.hand_positions, measure_contexts);
  annotations.push(
    ...lyrics.map((lyric) => lyric.annotation),
    ...hand_positions.map((segment) => segment.annotation),
  );
  validate_score_review(document.review, document.status);

  if (for_publish) {
    if (document.status !== "published") {
      throw new validation_error("发布文档的状态必须为 published");
    }
    if (annotations.some((annotation) => annotation.status !== "confirmed")) {
      throw new validation_error("候选或待审核标注不能发布");
    }
    if (!document.review.published_by || !document.review.published_at) {
      throw new validation_error("发布文档必须记录发布人和发布时间");
    }
  }
  return document;
}

function validate_score_provenance(value) {
  const provenance = as_record(value, "乐谱来源必须是对象");
  const kind = valid_set_value(provenance.kind, score_provenance_kinds, "乐谱来源类型");
  nullable_identifier(provenance.source_id, "来源 ID");
  nullable_string(provenance.source_file, "来源文件", 1_000);
  nullable_sha256(provenance.source_sha256, "来源文件哈希");
  nullable_string(provenance.font_config_version, "字体配置版本", 160);
  nullable_string(provenance.importer_version, "导入器版本", 160);
  const references = validate_score_source_references(provenance.references, "乐谱来源引用");
  if (
    kind === "pptx" &&
    (
      !provenance.source_id ||
      !provenance.source_file ||
      !provenance.source_sha256 ||
      !provenance.font_config_version ||
      !provenance.importer_version ||
      references.length === 0
    )
  ) {
    throw new validation_error("PPTX 乐谱来源信息不完整");
  }
}

function validate_score_source_references(value, label) {
  if (!Array.isArray(value) || value.length > 100_000) {
    throw new validation_error(`${label}无效`);
  }
  return value.map((raw_reference) => {
    const reference = as_record(raw_reference, `${label}必须是对象`);
    bounded_integer(reference.slide_number, "来源幻灯片", 1, 100_000);
    required_string(reference.shape_id, "来源 shape ID", 1, 160);
    nullable_nonnegative_integer(reference.paragraph_index, "来源段落序号");
    nullable_nonnegative_integer(reference.run_index, "来源 run 序号");
    return reference;
  });
}

function validate_score_annotation(value, label) {
  const annotation = as_record(value, `${label}必须是对象`);
  const source = valid_set_value(annotation.source, score_annotation_sources, `${label}来源`);
  const status = valid_set_value(annotation.status, score_annotation_statuses, `${label}状态`);
  required_string(annotation.reason, `${label}依据`, 1, 1_000);
  const confirmed_by = nullable_identifier(annotation.confirmed_by, `${label}确认人`);
  const confirmed_at = nullable_iso_timestamp(annotation.confirmed_at, `${label}确认时间`);
  validate_score_source_references(annotation.source_refs, `${label}来源引用`);
  if ((confirmed_by === null) !== (confirmed_at === null)) {
    throw new validation_error(`${label}确认人和确认时间必须同时填写`);
  }
  if (status === "confirmed" && source !== "legacy" && confirmed_by === null) {
    throw new validation_error(`${label}确认状态必须记录确认人`);
  }
  if (status !== "confirmed" && confirmed_by !== null) {
    throw new validation_error(`${label}未确认状态不能包含确认记录`);
  }
  return annotation;
}

function validate_score_lyrics(value, measure_contexts, event_ids) {
  if (!Array.isArray(value) || value.length > 100_000) {
    throw new validation_error("歌词列表无效");
  }
  const lyric_ids = new Set();
  return value.map((raw_lyric) => {
    const lyric = as_record(raw_lyric, "歌词必须是对象");
    const lyric_id = identifier(lyric.id, "歌词 ID");
    if (lyric_ids.has(lyric_id)) {
      throw new validation_error("歌词 ID 不能重复");
    }
    lyric_ids.add(lyric_id);
    bounded_integer(lyric.stanza_number, "歌词节次", 1, 10_000);
    required_string(lyric.text, "歌词", 1, 20_000, false);
    nullable_string(lyric.language, "歌词语言", 40);
    if (!Array.isArray(lyric.event_ids) || lyric.event_ids.length > 50_000) {
      throw new validation_error("歌词事件关联无效");
    }
    for (const event_id of lyric.event_ids) {
      const normalized_event_id = identifier(event_id, "歌词事件 ID");
      if (!event_ids.has(normalized_event_id)) {
        throw new validation_error("歌词关联了不存在的事件");
      }
    }
    if (lyric.range !== null) {
      validate_score_time_range(lyric.range, measure_contexts, "歌词范围");
    }
    if (lyric.slide_number !== null) {
      bounded_integer(lyric.slide_number, "歌词幻灯片", 1, 100_000);
    }
    return {
      ...lyric,
      annotation: validate_score_annotation(lyric.annotation, "歌词说明"),
    };
  });
}

function validate_score_hand_positions(value, measure_contexts) {
  if (!Array.isArray(value) || value.length > 100_000) {
    throw new validation_error("手位区段列表无效");
  }
  const segment_ids = new Set();
  return value.map((raw_segment) => {
    const segment = as_record(raw_segment, "手位区段必须是对象");
    const segment_id = identifier(segment.id, "手位区段 ID");
    if (segment_ids.has(segment_id)) {
      throw new validation_error("手位区段 ID 不能重复");
    }
    segment_ids.add(segment_id);
    valid_set_value(segment.hand, new Set(["left", "right"]), "手位手别");
    validate_score_time_range(segment.range, measure_contexts, "手位范围");
    required_string(segment.position_name, "手位名称", 1, 120);
    if (
      !Array.isArray(segment.covered_midis) ||
      segment.covered_midis.length === 0 ||
      segment.covered_midis.length > 32
    ) {
      throw new validation_error("手位覆盖音无效");
    }
    const covered_midis = new Set(
      segment.covered_midis.map((midi) => bounded_integer(midi, "手位覆盖音", 21, 108)),
    );
    if (covered_midis.size !== segment.covered_midis.length) {
      throw new validation_error("手位覆盖音不能重复");
    }
    if (!Array.isArray(segment.finger_map) || segment.finger_map.length > 5) {
      throw new validation_error("手位指法映射无效");
    }
    const mapped_fingers = new Set();
    for (const raw_mapping of segment.finger_map) {
      const mapping = as_record(raw_mapping, "手位指法映射必须是对象");
      const finger = bounded_integer(mapping.finger, "手位指法", 1, 5);
      const midi = bounded_integer(mapping.midi, "手位指法音高", 21, 108);
      if (mapped_fingers.has(finger)) {
        throw new validation_error("手位指法不能重复");
      }
      if (!covered_midis.has(midi)) {
        throw new validation_error("手位指法音高必须位于覆盖音中");
      }
      mapped_fingers.add(finger);
    }
    valid_set_value(segment.movement, score_hand_position_movements, "手位动作");
    return {
      ...segment,
      annotation: validate_score_annotation(segment.annotation, "手位说明"),
    };
  });
}

function validate_score_time_range(value, measure_contexts, label) {
  const range = as_record(value, `${label}必须是对象`);
  const start = validate_score_time_point(range.start, measure_contexts, `${label}起点`);
  const end = validate_score_time_point(range.end, measure_contexts, `${label}终点`);
  if (start.index > end.index || (start.index === end.index && start.beat > end.beat)) {
    throw new validation_error(`${label}终点不能早于起点`);
  }
}

function validate_score_time_point(value, measure_contexts, label) {
  const point = as_record(value, `${label}必须是对象`);
  const measure_id = identifier(point.measure_id, `${label}小节 ID`);
  const context = measure_contexts.get(measure_id);
  if (!context) {
    throw new validation_error(`${label}引用了不存在的小节`);
  }
  const beat = bounded_number(point.beat, `${label}拍点`, 0, context.beats);
  return { index: context.index, beat };
}

function validate_score_review(value, document_status) {
  const review = as_record(value, "审核信息必须是对象");
  const reviewed_by = nullable_identifier(review.reviewed_by, "审核人");
  const reviewed_at = nullable_iso_timestamp(review.reviewed_at, "审核时间");
  const published_by = nullable_identifier(review.published_by, "发布人");
  const published_at = nullable_iso_timestamp(review.published_at, "发布时间");
  nullable_string(review.note, "审核说明", 2_000);
  if ((reviewed_by === null) !== (reviewed_at === null)) {
    throw new validation_error("审核人和审核时间必须同时填写");
  }
  if ((published_by === null) !== (published_at === null)) {
    throw new validation_error("发布人和发布时间必须同时填写");
  }
  if (document_status === "reviewed" && reviewed_by === null) {
    throw new validation_error("已审核乐谱必须记录审核人");
  }
  if (document_status === "published" && published_by === null) {
    throw new validation_error("已发布乐谱必须记录发布人");
  }
}

export function normalize_email(value) {
  const email = required_string(value, "邮箱", 3, 254).toLowerCase();
  if (!email_pattern.test(email)) {
    throw new validation_error("邮箱格式无效");
  }
  return email;
}

function validate_progress(value) {
  const progress = as_record(value, "学习进度必须是对象");
  if (progress.schema_version !== 2) {
    throw new validation_error("学习进度版本无效");
  }
  const completed_lesson_ids = string_array(
    progress.completed_lesson_ids,
    "已完成课程",
    5_000,
  );
  const weak_lesson_ids = string_array(progress.weak_lesson_ids, "薄弱课程", 5_000);
  const source_results = as_record(progress.results_by_lesson, "练习结果必须是对象");
  const results_by_lesson = {};
  if (Object.keys(source_results).length > 5_000) {
    throw new validation_error("练习课程数量过多");
  }
  for (const [lesson_id, raw_results] of Object.entries(source_results)) {
    identifier(lesson_id, "课程 ID");
    if (!Array.isArray(raw_results) || raw_results.length > 32) {
      throw new validation_error("单项课程最多保留 32 次同步结果");
    }
    results_by_lesson[lesson_id] = raw_results.map(validate_progress_result);
  }

  return {
    schema_version: 2,
    start_date: optional_string(progress.start_date, 20),
    current_phase_id: optional_string(progress.current_phase_id, 120),
    current_week_number: optional_bounded_integer(progress.current_week_number, 1, 36),
    current_day_index: optional_bounded_integer(progress.current_day_index, 1, 3),
    completed_lesson_ids,
    results_by_lesson,
    weak_lesson_ids,
    last_practiced_on: optional_string(progress.last_practiced_on, 20),
    streak_days: bounded_integer(progress.streak_days ?? 0, "连续练习天数", 0, 100_000),
  };
}

function validate_progress_result(value) {
  const result = as_record(value, "练习结果必须是对象");
  return {
    lesson_id: identifier(result.lesson_id, "课程 ID"),
    started_at: timestamp(result.started_at, "开始时间"),
    completed_at: timestamp(result.completed_at, "完成时间"),
    total_steps: bounded_integer(result.total_steps ?? 0, "总拍数", 0, 1_000_000),
    correct_steps: bounded_integer(result.correct_steps ?? 0, "正确拍数", 0, 1_000_000),
    mistakes: bounded_integer(result.mistakes ?? 0, "错误数", 0, 1_000_000),
    early_steps: bounded_integer(result.early_steps ?? 0, "提前次数", 0, 1_000_000),
    late_steps: bounded_integer(result.late_steps ?? 0, "延后次数", 0, 1_000_000),
    max_combo: bounded_integer(result.max_combo ?? 0, "最高连击", 0, 1_000_000),
    accuracy: ratio(result.accuracy, "正确率"),
    completed: result.completed === true,
    note: optional_string(result.note, 500),
    input_source: result.input_source === undefined
      ? undefined
      : valid_set_value(result.input_source, input_sources, "输入来源"),
    bpm: optional_bounded_integer(result.bpm, 20, 300),
    last_measure_index: optional_bounded_integer(result.last_measure_index, 0, 20_000),
    duration_ms: optional_bounded_integer(result.duration_ms, 0, 86_400_000),
  };
}

function validate_preferences(value) {
  const preferences = as_record(value, "学习偏好必须是对象");
  const calibration_field_order = normalize_calibration_field_order(
    preferences.calibration_field_order,
  );
  return {
    sidebar_collapsed: preferences.sidebar_collapsed === true,
    free_practice: preferences.free_practice !== false,
    show_fingerings: preferences.show_fingerings !== false,
    audio_input_enabled: preferences.audio_input_enabled === true,
    audio_calibration_midi: optional_bounded_integer(
      preferences.audio_calibration_midi,
      21,
      108,
    ),
    audio_calibration_frequency: optional_number(
      preferences.audio_calibration_frequency,
      1,
      20_000,
    ),
    audio_tuning_offset_cents: optional_number(
      preferences.audio_tuning_offset_cents,
      -200,
      200,
    ),
    calibration_field_order,
    calibration_primary_fields: normalize_primary_calibration_fields(
      preferences.calibration_primary_fields,
      calibration_field_order,
    ),
  };
}

function normalize_calibration_field_order(value) {
  if (!Array.isArray(value)) {
    return [...calibration_fields];
  }
  const valid = value.filter((field) => calibration_fields.includes(field));
  const unique = [...new Set(valid)];
  return [
    ...unique,
    ...calibration_fields.filter((field) => !unique.includes(field)),
  ];
}

function normalize_primary_calibration_fields(value, order) {
  if (!Array.isArray(value)) {
    return [...default_primary_calibration_fields];
  }
  const valid = value.filter((field) => calibration_fields.includes(field));
  const unique = [...new Set(valid)];
  return normalize_calibration_field_order(order)
    .filter((field) => unique.includes(field));
}

function validate_metrics(value) {
  const metrics = value === undefined ? {} : as_record(value, "评测指标必须是对象");
  const allowed = [
    "total_steps",
    "correct_steps",
    "max_combo",
    "note",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => metrics[key] !== undefined)
      .map((key) => [key, typeof metrics[key] === "string"
        ? metrics[key].slice(0, 500)
        : Number(metrics[key]) || 0]),
  );
}

function validate_content_metadata(value) {
  const metadata = as_record(value ?? {}, "内容元数据必须是对象");
  return {
    difficulty: optional_string(metadata.difficulty, 40),
    key_signature: optional_string(metadata.key_signature, 40),
    time_signature: optional_string(metadata.time_signature, 20),
    hand_mode: metadata.hand_mode === undefined
      ? undefined
      : valid_set_value(metadata.hand_mode, new Set(["left", "right", "both"]), "手别"),
    learning_goal: optional_string(metadata.learning_goal, 500),
    recommended_weeks: optional_string(metadata.recommended_weeks, 80),
    rights_note: optional_string(metadata.rights_note, 500),
    attribution: optional_string(metadata.attribution, 200),
  };
}

function required_string(value, label, min, max, trim = true) {
  if (typeof value !== "string") {
    throw new validation_error(`${label}不能为空`);
  }
  const normalized = trim ? value.trim() : value;
  const length = [...normalized].length;
  if (length < min || length > max) {
    throw new validation_error(`${label}长度必须在 ${min}—${max} 个字符之间`);
  }
  return normalized;
}

function optional_string(value, max) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return required_string(value, "文本", 1, max);
}

function identifier(value, label) {
  const result = required_string(value, label, 1, 160);
  if (!/^[A-Za-z0-9._:-]+$/.test(result)) {
    throw new validation_error(`${label}格式无效`);
  }
  return result;
}

function optional_identifier(value, label) {
  return value === undefined || value === null || value === ""
    ? undefined
    : identifier(value, label);
}

function nullable_identifier(value, label) {
  return value === undefined || value === null || value === ""
    ? null
    : identifier(value, label);
}

function nullable_string(value, label, max) {
  return value === undefined || value === null
    ? null
    : required_string(value, label, 1, max);
}

function nullable_sha256(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = required_string(value, label, 64, 64);
  if (!sha256_pattern.test(normalized)) {
    throw new validation_error(`${label}格式无效`);
  }
  return normalized;
}

function nullable_nonnegative_integer(value, label) {
  return value === undefined || value === null
    ? null
    : bounded_integer(value, label, 0, 2_147_483_647);
}

function nullable_iso_timestamp(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = required_string(value, label, 1, 40);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new validation_error(`${label}格式无效`);
  }
  return normalized;
}

function timestamp(value, label) {
  return bounded_integer(value, label, 0, 9_007_199_254_740_991);
}

function ratio(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new validation_error(`${label}必须在 0 到 1 之间`);
  }
  return number;
}

function nonnegative_integer(value, label) {
  return bounded_integer(value, label, 0, 2_147_483_647);
}

function bounded_integer(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new validation_error(`${label}无效`);
  }
  return number;
}

function optional_bounded_integer(value, min, max) {
  return value === undefined || value === null
    ? undefined
    : bounded_integer(value, "数值", min, max);
}

function optional_number(value, min, max) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new validation_error("数值无效");
  }
  return number;
}

function bounded_number(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new validation_error(`${label}无效`);
  }
  return number;
}

function string_array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) {
    throw new validation_error(`${label}无效`);
  }
  return value.map((item) => identifier(item, label));
}

function valid_set_value(value, values, label) {
  const normalized = String(value);
  if (!values.has(normalized)) {
    throw new validation_error(`${label}无效`);
  }
  return normalized;
}

function as_record(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new validation_error(message);
  }
  return value;
}
