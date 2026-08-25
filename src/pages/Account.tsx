import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Cloud,
  CloudOff,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { api_request } from "@/features/api/client";
import type { account_user, user_role } from "@/features/auth/types";
import { use_auth_store } from "@/store/useAuthStore";

interface account_props {
  user_override?: account_user | null;
  sync_status_override?: ReturnType<typeof use_auth_store.getState>["sync_status"];
}

export function Account({
  user_override,
  sync_status_override,
}: account_props = {}) {
  const status = use_auth_store((state) => state.status);
  const sync_status = use_auth_store((state) => state.sync_status);
  const stored_user = use_auth_store((state) => state.user);
  const last_synced_at = use_auth_store((state) => state.last_synced_at);
  const error = use_auth_store((state) => state.error);
  const initialize = use_auth_store((state) => state.initialize);
  const login = use_auth_store((state) => state.login);
  const register = use_auth_store((state) => state.register);
  const logout = use_auth_store((state) => state.logout);
  const delete_account = use_auth_store((state) => state.delete_account);
  const clear_error = use_auth_store((state) => state.clear_error);
  const [mode, set_mode] = useState<"login" | "register">("login");
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [display_name, set_display_name] = useState("");
  const [role, set_role] = useState<"student" | "parent">("student");
  const [delete_password, set_delete_password] = useState("");
  const [delete_open, set_delete_open] = useState(false);
  const [account_action_error, set_account_action_error] = useState<string>();
  const user = user_override === undefined ? stored_user : user_override ?? undefined;
  const effective_sync_status = sync_status_override ?? sync_status;

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const handle_submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear_error();
    if (mode === "login") {
      await login({ email, password });
      return;
    }
    await register({ email, password, display_name, role });
  };

  const handle_export = async () => {
    try {
      const data = await api_request<unknown>("/api/v1/me/export");
      const url = URL.createObjectURL(new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" },
      ));
      const link = document.createElement("a");
      link.href = url;
      link.download = `panio-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      set_account_action_error(undefined);
    } catch (export_error) {
      set_account_action_error(
        export_error instanceof Error ? export_error.message : "数据导出失败。",
      );
    }
  };

  const handle_delete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await delete_account(delete_password)) {
      set_delete_password("");
      set_delete_open(false);
    }
  };

  return (
    <AppShell>
      <section className="page-intro account-intro">
        <div>
          <p className="eyebrow"><Cloud size={15} /> 账号与同步</p>
          <h1>换一台设备，<br />学习仍从上次继续。</h1>
          <p className="intro-copy">
            游客可以一直在本机练习。注册后，课程进度、练习结果和显示偏好会安全同步，不上传麦克风录音。
          </p>
        </div>
        <SyncBadge status={effective_sync_status} last_synced_at={last_synced_at} />
      </section>

      {user ? (
        <section className="account-panel is-signed-in">
          <div className="account-identity">
            <span><ShieldCheck size={22} /></span>
            <div>
              <p className="section-kicker">当前账号</p>
              <h2>{user.display_name}</h2>
              <p>{user.email} · {get_role_label(user.role)}</p>
            </div>
          </div>

          <div className="account-capabilities">
            <article>
              <Cloud size={18} />
              <strong>多设备同步</strong>
              <p>进度、偏好和练习结果已经与账号绑定。</p>
            </article>
            <article>
              <KeyRound size={18} />
              <strong>最少个人数据</strong>
              <p>仅保存邮箱、显示名称和学习数据，不收集生日或真实姓名。</p>
            </article>
          </div>

          <div className="account-actions">
            {user.role === "admin" && (
              <Link to="/后台" className="primary-button">
                进入内容后台 <ArrowRight size={17} />
              </Link>
            )}
            <button type="button" className="secondary-button" onClick={() => void logout()}>
              <LogOut size={17} />
              退出账号
            </button>
            <button type="button" className="secondary-button" onClick={() => void handle_export()}>
              <Download size={17} />
              导出我的数据
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => set_delete_open((open) => !open)}
            >
              <Trash2 size={17} />
              删除账号
            </button>
          </div>
          {account_action_error && (
            <p className="account-error" role="alert">{account_action_error}</p>
          )}
          {delete_open && (
            <form className="account-delete-form" onSubmit={handle_delete}>
              <div>
                <strong>删除后无法撤销</strong>
                <p>账号、同步进度、练习明细和会话都会永久删除。本机记录仍保留。</p>
              </div>
              <label>
                <span>再次输入密码</span>
                <input
                  type="password"
                  value={delete_password}
                  onChange={(event) => set_delete_password(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {error && <p className="account-error" role="alert">{error}</p>}
              <button type="submit" className="danger-button">确认永久删除</button>
            </form>
          )}
        </section>
      ) : (
        <section className="account-panel">
          <div className="account-mode-tabs" role="tablist" aria-label="账号操作">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "is-active" : ""}
              onClick={() => {
                set_mode("login");
                clear_error();
              }}
            >
              <LogIn size={17} /> 登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "is-active" : ""}
              onClick={() => {
                set_mode("register");
                clear_error();
              }}
            >
              <UserPlus size={17} /> 注册
            </button>
          </div>

          <form className="account-form" onSubmit={handle_submit}>
            {mode === "register" && (
              <>
                <label>
                  <span>显示名称</span>
                  <input
                    value={display_name}
                    onChange={(event) => set_display_name(event.target.value)}
                    autoComplete="nickname"
                    maxLength={40}
                    required
                  />
                  <small>可以使用昵称，不要求填写真实姓名。</small>
                </label>
                <fieldset>
                  <legend>使用身份</legend>
                  <label>
                    <input
                      type="radio"
                      name="role"
                      value="student"
                      checked={role === "student"}
                      onChange={() => set_role("student")}
                    />
                    学生
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="role"
                      value="parent"
                      checked={role === "parent"}
                      onChange={() => set_role("parent")}
                    />
                    家长
                  </label>
                </fieldset>
              </>
            )}
            <label>
              <span>邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(event) => set_email(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => set_password(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={10}
                maxLength={128}
                required
              />
              {mode === "register" && <small>至少 10 个字符。</small>}
            </label>

            {error && <p className="account-error" role="alert">{error}</p>}

            <button type="submit" className="primary-button" disabled={status === "loading"}>
              {mode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}
              {status === "loading"
                ? "正在连接…"
                : mode === "login"
                  ? "登录并同步"
                  : "注册并合并本机进度"}
            </button>
          </form>
        </section>
      )}
    </AppShell>
  );
}

function SyncBadge({
  status,
  last_synced_at,
}: {
  status: ReturnType<typeof use_auth_store.getState>["sync_status"];
  last_synced_at?: string;
}) {
  const is_synced = status === "synced";
  return (
    <div className={`account-sync-badge ${is_synced ? "is-synced" : ""}`}>
      {is_synced ? <Cloud size={18} /> : <CloudOff size={18} />}
      <div>
        <strong>{get_sync_label(status)}</strong>
        <p>{last_synced_at ? `最近同步 ${format_time(last_synced_at)}` : "本机记录不会丢失"}</p>
      </div>
    </div>
  );
}

function get_sync_label(status: ReturnType<typeof use_auth_store.getState>["sync_status"]): string {
  if (status === "syncing") {
    return "正在同步";
  }
  if (status === "synced") {
    return "已同步到账号";
  }
  if (status === "pending") {
    return "等待恢复同步";
  }
  return "仅保存在本机";
}

function get_role_label(role: user_role): string {
  return {
    student: "学生",
    parent: "家长",
    teacher: "老师",
    admin: "管理员",
  }[role];
}

function format_time(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
