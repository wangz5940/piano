import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  BookUp,
  CheckCircle2,
  CircleAlert,
  FileMusic,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { api_request } from "@/features/api/client";
import type {
  account_user,
  managed_curriculum,
  managed_content,
  managed_score,
  score_document_event,
  score_draft_record,
  user_role,
} from "@/features/auth/types";
import { use_auth_store } from "@/store/useAuthStore";

interface admin_props {
  user_override?: account_user | null;
}

export function Admin({ user_override }: admin_props = {}) {
  const stored_user = use_auth_store((state) => state.user);
  const status = use_auth_store((state) => state.status);
  const [content, set_content] = useState<managed_content[]>([]);
  const [curriculum, set_curriculum] = useState<managed_curriculum>();
  const [scores, set_scores] = useState<managed_score[]>([]);
  const [users, set_users] = useState<account_user[]>([]);
  const [load_error, set_load_error] = useState<string>();
  const [refresh_key, set_refresh_key] = useState(0);
  const user = user_override === undefined ? stored_user : user_override ?? undefined;

  useEffect(() => {
    if (user?.role !== "admin") {
      return;
    }
    let active = true;
    Promise.all([
      api_request<{ content: managed_content[] }>("/api/v1/admin/content"),
      api_request<{ curriculum: managed_curriculum }>("/api/v1/admin/curriculums/active/nodes"),
      api_request<{ scores: managed_score[] }>("/api/v1/admin/scores"),
      api_request<{ users: account_user[] }>("/api/v1/admin/users"),
    ])
      .then(([content_response, curriculum_response, scores_response, users_response]) => {
        if (active) {
          set_content(content_response.content);
          set_curriculum(curriculum_response.curriculum);
          set_scores(scores_response.scores);
          set_users(users_response.users);
          set_load_error(undefined);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          set_load_error(error instanceof Error ? error.message : "后台数据加载失败");
        }
      });
    return () => {
      active = false;
    };
  }, [refresh_key, user?.role]);

  if (!user) {
    return (
      <AppShell>
        <AdminState
          icon={<ShieldCheck size={24} />}
          title={status === "loading" ? "正在确认账号权限" : "请先登录管理员账号"}
          copy="内容上传、版本发布和用户角色调整必须经过服务端权限验证。"
        >
          <Link to="/账号" className="primary-button">
            前往登录 <ArrowRight size={17} />
          </Link>
        </AdminState>
      </AppShell>
    );
  }

  if (user.role !== "admin") {
    return (
      <AppShell>
        <AdminState
          icon={<CircleAlert size={24} />}
          title="当前账号没有内容管理权限"
          copy={`你当前以${get_role_label(user.role)}身份登录。后台只向管理员开放。`}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page-intro admin-intro">
        <div>
          <p className="eyebrow"><ShieldCheck size={15} /> 内容管理后台</p>
          <h1>每次修谱，<br />都留下可追溯的版本。</h1>
          <p className="intro-copy">
            上传 MusicXML 与同版本跟弹数据，检查完成后再发布。旧版本不会被覆盖，已有练习记录仍能指向当时使用的谱面。
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => set_refresh_key((key) => key + 1)}
        >
          <RefreshCw size={16} /> 刷新后台
        </button>
      </section>

      {load_error && <p className="admin-error" role="alert">{load_error}</p>}

      <section className="admin-grid">
        <CurriculumOrderPanel
          curriculum={curriculum}
          on_saved={() => set_refresh_key((key) => key + 1)}
        />
        <ScoreDraftEditor
          scores={scores}
          on_saved={() => set_refresh_key((key) => key + 1)}
        />
        <ContentUpload
          content={content}
          on_saved={() => set_refresh_key((key) => key + 1)}
        />
        <ContentVersions
          content={content}
          on_published={() => set_refresh_key((key) => key + 1)}
        />
      </section>

      <UserManagement
        users={users}
        current_user_id={user.id}
        on_updated={() => set_refresh_key((key) => key + 1)}
      />
    </AppShell>
  );
}

function CurriculumOrderPanel({
  curriculum,
  on_saved,
}: {
  curriculum: managed_curriculum | undefined;
  on_saved: () => void;
}) {
  const [node_id, set_node_id] = useState("");
  const [position, set_position] = useState(1);
  const [message, set_message] = useState<string>();
  const nodes = useMemo(() => curriculum?.nodes ?? [], [curriculum?.nodes]);

  useEffect(() => {
    if (!node_id && nodes[0]) {
      set_node_id(nodes[0].id);
      set_position(nodes[0].position);
    }
  }, [node_id, nodes]);

  const move_node = async () => {
    if (!node_id) {
      set_message("请选择课程节点。");
      return;
    }
    try {
      await api_request(`/api/v1/admin/curriculum-nodes/${node_id}/move`, {
        method: "PATCH",
        body: { position },
      });
      set_message("课程节点顺序已更新。");
      on_saved();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "课程节点更新失败");
    }
  };

  const archive_node = async () => {
    if (!node_id) {
      set_message("请选择课程节点。");
      return;
    }
    try {
      await api_request(`/api/v1/admin/curriculum-nodes/${node_id}/archive`, {
        method: "PATCH",
        body: {},
      });
      set_message("课程节点已归档。");
      on_saved();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "课程节点归档失败");
    }
  };

  return (
    <article className="admin-card">
      <header>
        <div>
          <p className="section-kicker"><BookUp size={15} /> 课程编排</p>
          <h2>数据库课程顺序</h2>
        </div>
        <span>{nodes.length} 个节点</span>
      </header>
      {!curriculum ? (
        <p className="admin-empty">正在读取数据库课程。</p>
      ) : (
        <div className="admin-form">
          <label>
            <span>课程节点</span>
            <select
              value={node_id}
              onChange={(event) => {
                const next_node = nodes.find((node) => node.id === event.target.value);
                set_node_id(event.target.value);
                set_position(next_node?.position ?? 1);
              }}
            >
              {nodes.slice(0, 200).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.kind} · {node.title} · {node.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>排序位置</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={position}
              onChange={(event) => set_position(Number(event.target.value))}
            />
          </label>
          <div className="admin-form-row">
            <button type="button" className="primary-button" onClick={() => void move_node()}>
              保存顺序
            </button>
            <button type="button" className="secondary-button" onClick={() => void archive_node()}>
              归档节点
            </button>
          </div>
          <p className="admin-empty">
            当前发布版：{curriculum.revision.title}。已发布记录不会被删除；删除动作会转为归档。
          </p>
        </div>
      )}
      {message && <p className="admin-form-message" role="status">{message}</p>}
    </article>
  );
}

function ScoreDraftEditor({
  scores,
  on_saved,
}: {
  scores: managed_score[];
  on_saved: () => void;
}) {
  const [score_id, set_score_id] = useState("");
  const [draft, set_draft] = useState<score_draft_record>();
  const [event_id, set_event_id] = useState("");
  const [note_id, set_note_id] = useState("");
  const [midi, set_midi] = useState(60);
  const [finger, set_finger] = useState(1);
  const [onset_beats, set_onset_beats] = useState(0);
  const [duration_beats, set_duration_beats] = useState(1);
  const [hand, set_hand] = useState<"left" | "right">("right");
  const [message, set_message] = useState<string>();
  const selected_score = scores.find((score) => score.id === score_id);
  const events = get_draft_events(draft);
  const selected_event = events.find((event) => event.id === event_id);
  const selected_note = selected_event?.notes.find((note) => note.id === note_id);

  useEffect(() => {
    if (!score_id && scores[0]) {
      set_score_id(scores[0].id);
      set_draft(scores[0].drafts[0]);
    }
  }, [score_id, scores]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    const first_event = get_draft_events(draft)[0];
    if (first_event) {
      set_event_id(first_event.id);
      set_note_id(first_event.notes[0]?.id ?? "");
      set_midi(first_event.notes[0]?.midi ?? 60);
      set_finger(first_event.notes[0]?.finger ?? 1);
      set_onset_beats(first_event.onset_beats);
      set_duration_beats(first_event.duration_beats);
      set_hand(first_event.hand);
    }
  }, [draft]);

  useEffect(() => {
    if (!selected_event) {
      return;
    }
    set_note_id(selected_event.notes[0]?.id ?? "");
    set_midi(selected_event.notes[0]?.midi ?? 60);
    set_finger(selected_event.notes[0]?.finger ?? 1);
    set_onset_beats(selected_event.onset_beats);
    set_duration_beats(selected_event.duration_beats);
    set_hand(selected_event.hand);
  }, [selected_event]);

  useEffect(() => {
    if (selected_note) {
      set_midi(selected_note.midi);
      set_finger(selected_note.finger ?? 1);
    }
  }, [selected_note]);

  const create_draft = async () => {
    if (!score_id) {
      set_message("请选择乐谱。");
      return;
    }
    try {
      const response = await api_request<{ draft: score_draft_record }>(
        `/api/v1/admin/scores/${score_id}/drafts`,
        { method: "POST", body: {} },
      );
      set_draft(response.draft);
      set_message("乐谱草稿已创建。");
      on_saved();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "创建草稿失败");
    }
  };

  const save_event = async () => {
    if (!draft || !event_id || !note_id) {
      set_message("请选择草稿、事件和音符。");
      return;
    }
    try {
      const response = await api_request<{ draft: score_draft_record }>(
        `/api/v1/admin/score-drafts/${draft.id}/events/${event_id}`,
        {
          method: "PATCH",
          body: {
            note_id,
            midi,
            finger,
            onset_beats,
            duration_beats,
            hand,
          },
        },
      );
      set_draft(response.draft);
      set_message("事件已保存，草稿已重新校验。");
      on_saved();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "保存事件失败");
    }
  };

  const publish_draft = async () => {
    if (!draft) {
      set_message("请先创建草稿。");
      return;
    }
    try {
      await api_request(`/api/v1/admin/score-drafts/${draft.id}/publish`, {
        method: "POST",
        body: {},
      });
      set_message("乐谱草稿已发布为新版本。");
      set_draft(undefined);
      on_saved();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "发布草稿失败");
    }
  };

  return (
    <article className="admin-card">
      <header>
        <div>
          <p className="section-kicker"><FileMusic size={15} /> 曲谱校对</p>
          <h2>音符级 ScoreDocument 编辑</h2>
        </div>
        <span>{scores.length} 份谱</span>
      </header>
      <div className="admin-form">
        <label>
          <span>乐谱</span>
          <select
            value={score_id}
            onChange={(event) => {
              const next_score = scores.find((score) => score.id === event.target.value);
              set_score_id(event.target.value);
              set_draft(next_score?.drafts[0]);
            }}
          >
            {scores.map((score) => (
              <option key={score.id} value={score.id}>{score.title}</option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={() => void create_draft()}>
          创建/打开草稿
        </button>
        {draft && (
          <>
            <label>
              <span>事件</span>
              <select value={event_id} onChange={(event) => set_event_id(event.target.value)}>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.id} · {event.hand} · {event.notes.map((note) => note.midi).join("+")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>音符</span>
              <select value={note_id} onChange={(event) => set_note_id(event.target.value)}>
                {selected_event?.notes.map((note) => (
                  <option key={note.id} value={note.id}>{note.id}</option>
                ))}
              </select>
            </label>
            <div className="admin-form-row">
              <label>
                <span>MIDI 音高</span>
                <input type="number" min={21} max={108} value={midi} onChange={(event) => set_midi(Number(event.target.value))} />
              </label>
              <label>
                <span>指法</span>
                <input type="number" min={1} max={5} value={finger} onChange={(event) => set_finger(Number(event.target.value))} />
              </label>
            </div>
            <div className="admin-form-row">
              <label>
                <span>起拍</span>
                <input type="number" min={0} step={0.25} value={onset_beats} onChange={(event) => set_onset_beats(Number(event.target.value))} />
              </label>
              <label>
                <span>时值</span>
                <input type="number" min={0.0625} step={0.25} value={duration_beats} onChange={(event) => set_duration_beats(Number(event.target.value))} />
              </label>
            </div>
            <label>
              <span>手别</span>
              <select value={hand} onChange={(event) => set_hand(event.target.value as "left" | "right")}>
                <option value="right">右手</option>
                <option value="left">左手</option>
              </select>
            </label>
            <div className="admin-form-row">
              <button type="button" className="primary-button" onClick={() => void save_event()}>
                保存事件
              </button>
              <button type="button" className="secondary-button" onClick={() => void publish_draft()}>
                发布草稿
              </button>
            </div>
          </>
        )}
        {!selected_score && <p className="admin-empty">暂无可编辑乐谱。</p>}
      </div>
      {message && <p className="admin-form-message" role="status">{message}</p>}
    </article>
  );
}

function get_draft_events(draft: score_draft_record | undefined): score_document_event[] {
  return draft?.document.measures.flatMap((measure) => measure.events) ?? [];
}

function ContentUpload({
  content,
  on_saved,
}: {
  content: managed_content[];
  on_saved: () => void;
}) {
  const [content_id, set_content_id] = useState("new");
  const [title, set_title] = useState("");
  const [kind, set_kind] = useState<managed_content["kind"]>("piece");
  const [difficulty, set_difficulty] = useState("");
  const [key_signature, set_key_signature] = useState("");
  const [time_signature, set_time_signature] = useState("");
  const [hand_mode, set_hand_mode] = useState<"left" | "right" | "both">("both");
  const [learning_goal, set_learning_goal] = useState("");
  const [musicxml_file, set_musicxml_file] = useState<File>();
  const [practice_file, set_practice_file] = useState<File>();
  const [message, set_message] = useState<string>();
  const [saving, set_saving] = useState(false);

  const handle_submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!musicxml_file) {
      set_message("请选择 MusicXML 文件。");
      return;
    }
    set_saving(true);
    set_message(undefined);
    try {
      let target_content_id = content_id;
      if (target_content_id === "new") {
        const created = await api_request<{ content: managed_content }>(
          "/api/v1/admin/content",
          {
            method: "POST",
            body: {
              title,
              kind,
              metadata: {
                difficulty,
                key_signature,
                time_signature,
                hand_mode,
                learning_goal,
              },
            },
          },
        );
        target_content_id = created.content.id;
      }

      const musicxml_text = await musicxml_file.text();
      const practice_data = practice_file
        ? JSON.parse(await practice_file.text()) as unknown
        : undefined;
      const response = await api_request<{
        version: { version_number: number; source_sha256: string };
      }>(`/api/v1/admin/content/${target_content_id}/versions`, {
        method: "POST",
        body: { musicxml_text, practice_data },
      });
      set_content_id(target_content_id);
      set_message(
        `已保存第 ${response.version.version_number} 版，校验值 ${response.version.source_sha256.slice(0, 12)}…`,
      );
      on_saved();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "上传失败");
    } finally {
      set_saving(false);
    }
  };

  return (
    <article className="admin-card">
      <header>
        <div>
          <p className="section-kicker"><Upload size={15} /> 上传与修谱</p>
          <h2>保存一个不可变版本</h2>
        </div>
        <span>最大 4 MiB</span>
      </header>

      <form className="admin-form" onSubmit={handle_submit}>
        <label>
          <span>保存到</span>
          <select value={content_id} onChange={(event) => set_content_id(event.target.value)}>
            <option value="new">新建内容项</option>
            {content.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>

        {content_id === "new" && (
          <>
            <div className="admin-form-row">
              <label>
                <span>标题</span>
                <input value={title} onChange={(event) => set_title(event.target.value)} required />
              </label>
              <label>
                <span>内容种类</span>
                <select
                  value={kind}
                  onChange={(event) => set_kind(event.target.value as managed_content["kind"])}
                >
                  <option value="piece">曲目</option>
                  <option value="exercise">练习</option>
                  <option value="material">教材</option>
                  <option value="course">课程</option>
                </select>
              </label>
            </div>
            <div className="admin-form-row">
              <label>
                <span>难度</span>
                <input value={difficulty} onChange={(event) => set_difficulty(event.target.value)} />
              </label>
              <label>
                <span>手别</span>
                <select
                  value={hand_mode}
                  onChange={(event) => set_hand_mode(event.target.value as typeof hand_mode)}
                >
                  <option value="right">右手</option>
                  <option value="left">左手</option>
                  <option value="both">双手</option>
                </select>
              </label>
            </div>
            <div className="admin-form-row">
              <label>
                <span>调号</span>
                <input value={key_signature} onChange={(event) => set_key_signature(event.target.value)} />
              </label>
              <label>
                <span>拍号</span>
                <input value={time_signature} onChange={(event) => set_time_signature(event.target.value)} />
              </label>
            </div>
            <label>
              <span>练习目标</span>
              <textarea
                value={learning_goal}
                onChange={(event) => set_learning_goal(event.target.value)}
                rows={3}
              />
            </label>
          </>
        )}

        <label className="admin-file-field">
          <span><FileMusic size={15} /> MusicXML 原谱</span>
          <input
            type="file"
            accept=".musicxml,.xml,application/xml"
            onChange={(event) => set_musicxml_file(event.target.files?.[0])}
            required
          />
          <small>{musicxml_file?.name ?? "必须包含 score-partwise 或 score-timewise 根元素。"}</small>
        </label>
        <label className="admin-file-field">
          <span><BookUp size={15} /> 跟弹数据 JSON</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => set_practice_file(event.target.files?.[0])}
          />
          <small>{practice_file?.name ?? "可选；若上传，source_sha256 必须与原谱一致。"}</small>
        </label>

        {message && <p className="admin-form-message" role="status">{message}</p>}
        <button type="submit" className="primary-button" disabled={saving}>
          <Upload size={17} /> {saving ? "正在校验并保存…" : "上传新版本"}
        </button>
      </form>
    </article>
  );
}

function ContentVersions({
  content,
  on_published,
}: {
  content: managed_content[];
  on_published: () => void;
}) {
  const [message, set_message] = useState<string>();

  const publish = async (content_id: string, version_id: string) => {
    try {
      await api_request(`/api/v1/admin/content/${content_id}/publish`, {
        method: "POST",
        body: { version_id },
      });
      set_message("版本已发布，旧版本仍保留。");
      on_published();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "发布失败");
    }
  };

  return (
    <article className="admin-card">
      <header>
        <div>
          <p className="section-kicker"><CheckCircle2 size={15} /> 版本与发布</p>
          <h2>内容版本</h2>
        </div>
        <span>{content.length} 项</span>
      </header>
      <div className="admin-content-list">
        {content.length === 0 ? (
          <p className="admin-empty">还没有后台内容。先上传第一份 MusicXML。</p>
        ) : content.map((item) => (
          <section key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <small>{get_kind_label(item.kind)} · {item.status === "published" ? "已发布" : "草稿"}</small>
            </div>
            <ol>
              {item.versions.map((version) => (
                <li key={version.id}>
                  <span>
                    第 {version.version_number} 版
                    <small>{version.source_sha256.slice(0, 10)}…</small>
                  </span>
                  {item.current_version_id === version.id ? (
                    <em>当前发布版</em>
                  ) : (
                    <button type="button" onClick={() => void publish(item.id, version.id)}>
                      发布此版
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      {message && <p className="admin-form-message" role="status">{message}</p>}
    </article>
  );
}

function UserManagement({
  users,
  current_user_id,
  on_updated,
}: {
  users: account_user[];
  current_user_id: string;
  on_updated: () => void;
}) {
  const [message, set_message] = useState<string>();

  const update_role = async (user_id: string, role: "student" | "parent" | "teacher") => {
    try {
      await api_request(`/api/v1/admin/users/${user_id}/role`, {
        method: "PATCH",
        body: { role },
      });
      set_message("角色已更新，该用户需要重新登录。");
      on_updated();
    } catch (error) {
      set_message(error instanceof Error ? error.message : "角色更新失败");
    }
  };

  return (
    <section className="admin-users">
      <header>
        <div>
          <p className="section-kicker"><Users size={15} /> 账号权限</p>
          <h2>用户与角色</h2>
        </div>
        <span>{users.length} 个账号</span>
      </header>
      <div className="admin-user-table">
        {users.map((account) => (
          <article key={account.id}>
            <div>
              <strong>{account.display_name}</strong>
              <small>{account.email}</small>
            </div>
            {account.role === "admin" || account.id === current_user_id ? (
              <span>{get_role_label(account.role)}</span>
            ) : (
              <select
                value={account.role}
                onChange={(event) => void update_role(
                  account.id,
                  event.target.value as "student" | "parent" | "teacher",
                )}
                aria-label={`调整 ${account.display_name} 的角色`}
              >
                <option value="student">学生</option>
                <option value="parent">家长</option>
                <option value="teacher">老师</option>
              </select>
            )}
          </article>
        ))}
      </div>
      {message && <p className="admin-form-message" role="status">{message}</p>}
    </section>
  );
}

function AdminState({
  icon,
  title,
  copy,
  children,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <section className="admin-state">
      {icon}
      <h1>{title}</h1>
      <p>{copy}</p>
      {children}
    </section>
  );
}

function get_role_label(role: user_role): string {
  return {
    student: "学生",
    parent: "家长",
    teacher: "老师",
    admin: "管理员",
  }[role];
}

function get_kind_label(kind: managed_content["kind"]): string {
  return {
    material: "教材",
    course: "课程",
    exercise: "练习",
    piece: "曲目",
  }[kind];
}
