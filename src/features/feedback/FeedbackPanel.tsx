import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Check, ImagePlus, LoaderCircle, Send, X } from "lucide-react";
import { api_request } from "@/features/api/client";

interface feedback_entry {
  id: string;
  message: string;
  display_name: string;
  status: "pending" | "resolved";
  reply: string;
  created_at: string;
  images: { id: string; size_bytes: number; url: string }[];
}
interface feedback_page {
  feedback: feedback_entry[];
  next_offset: number | null;
}
const max_image_bytes = 5 * 1024 * 1024;
const image_types = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function FeedbackPanel({ is_admin }: { is_admin: boolean }) {
  const [message, set_message] = useState("");
  const [files, set_files] = useState<File[]>([]);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState("");
  const [submitted, set_submitted] = useState(false);
  const [revision, set_revision] = useState(0);
  const [scope, set_scope] = useState<"mine" | "all">(is_admin ? "all" : "mine");

  const select_files = (incoming: File[]) => {
    set_error("");
    set_submitted(false);
    if (files.length + incoming.length > 4) {
      set_error("最多上传 4 张图片，请先移除多余图片。");
      return;
    }
    if (incoming.some((file) => file.size >= max_image_bytes || file.size === 0)) {
      set_error("每张图片必须小于 5MB，且不能为空。");
      return;
    }
    if (incoming.some((file) => !image_types.has(file.type))) {
      set_error("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    set_files((current) => [...current, ...incoming]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    set_busy(true);
    set_error("");
    set_submitted(false);
    try {
      const body = new FormData();
      body.append("message", message.trim());
      files.forEach((file) => body.append("images", file));
      await api_request("/api/v1/feedback", { method: "POST", body });
      set_message("");
      set_files([]);
      set_submitted(true);
      set_revision((value) => value + 1);
    } catch (failure) {
      set_error(error_message(failure));
    } finally {
      set_busy(false);
    }
  };

  return (
    <div className="feedback-submission-panel">
      <form className="feedback-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="feedback-message">遇到了什么问题，或希望增加什么功能？</label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => { set_message(event.target.value); set_submitted(false); }}
          placeholder="例如：教材名称、曲目、小节，以及希望怎样改进…"
          maxLength={2000}
          rows={5}
          required
          disabled={busy}
          aria-describedby="feedback-privacy feedback-counter"
        />
        <div className="feedback-form-note">
          <span id="feedback-privacy">仅你和超级管理员可见。每人每天最多提交 5 条。</span>
          <span id="feedback-counter">{message.length}/2000</span>
        </div>
        <div className="feedback-attachments">
          <label className={`secondary-button feedback-upload ${busy || files.length >= 4 ? "is-disabled" : ""}`}>
            <ImagePlus size={17} /> 添加图片（{files.length}/4）
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy || files.length >= 4}
              aria-label="添加反馈图片"
              onChange={(event) => {
                select_files(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </label>
          <small>选填 · 每张小于 5MB · JPG / PNG / WebP</small>
        </div>
        {files.length > 0 && (
          <div className="feedback-images">
            {files.map((file, index) => (
              <SelectedImage
                key={`${index}:${file.name}:${file.lastModified}`}
                file={file}
                index={index}
                disabled={busy}
                remove={() => set_files((current) => current.filter((_, i) => i !== index))}
              />
            ))}
          </div>
        )}
        {error && <p className="account-error" role="alert">{error}</p>}
        {submitted && <p className="feedback-success" role="status"><Check size={17} /> 反馈已提交，可在下方查看回复。</p>}
        <button type="submit" className="primary-button" disabled={busy || !message.trim()}>
          {busy ? <LoaderCircle size={17} className="is-spinning" /> : <Send size={17} />}
          {busy ? "正在提交…" : "提交反馈"}
        </button>
      </form>

      <div className="feedback-history-heading">
        <h3>{scope === "all" ? "用户反馈" : "我的反馈"}</h3>
        {is_admin && (
          <div className="feedback-scope" role="group" aria-label="反馈范围">
            <button type="button" aria-pressed={scope === "mine"} onClick={() => set_scope("mine")}>我的反馈</button>
            <button type="button" aria-pressed={scope === "all"} onClick={() => set_scope("all")}>全部反馈</button>
          </div>
        )}
      </div>
      <FeedbackHistory key={`${scope}:${revision}`} scope={scope} is_admin={is_admin} />
    </div>
  );
}

function SelectedImage({ file, index, disabled, remove }: {
  file: File; index: number; disabled: boolean; remove: () => void;
}) {
  const [url, set_url] = useState("");
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    set_url(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return (
    <figure className="feedback-image">
      {url && <img src={url} alt={`待上传图片 ${index + 1}`} />}
      <figcaption>{file.name}</figcaption>
      <button type="button" disabled={disabled} onClick={remove} aria-label={`移除图片 ${index + 1}`}>
        <X size={16} />
      </button>
    </figure>
  );
}

function FeedbackHistory({ scope, is_admin }: { scope: "mine" | "all"; is_admin: boolean }) {
  const [page, set_page] = useState<feedback_page>();
  const [offset, set_offset] = useState(0);
  const [error, set_error] = useState("");
  const [attempt, set_attempt] = useState(0);
  useEffect(() => {
    let active = true;
    set_page(undefined);
    set_error("");
    void api_request<feedback_page>(`/api/v1/feedback?scope=${scope}&offset=${offset}`)
      .then((result) => { if (active) set_page(result); })
      .catch((failure) => { if (active) set_error(error_message(failure)); });
    return () => { active = false; };
  }, [scope, offset, attempt]);
  return (
    <div className="feedback-history" aria-live="polite">
      {error ? (
        <div>
          <p className="account-error" role="alert">{error}</p>
          <button type="button" className="secondary-button" onClick={() => set_attempt((value) => value + 1)}>重新加载</button>
        </div>
      ) : !page ? <p>正在加载反馈…</p> : page.feedback.length === 0 ? (
        <p className="feedback-empty">还没有反馈。你的建议会帮助我们改进练琴体验。</p>
      ) : (
        <>
          {page.feedback.map((entry) => (
            <FeedbackEntry key={entry.id} entry={entry} is_admin={is_admin} />
          ))}
          {(offset > 0 || page.next_offset !== null) && (
            <div className="feedback-pagination">
              <button type="button" className="secondary-button" disabled={offset === 0} onClick={() => set_offset((value) => Math.max(0, value - 20))}>上一页</button>
              <span>第 {offset / 20 + 1} 页</span>
              <button type="button" className="secondary-button" disabled={page.next_offset === null} onClick={() => set_offset(page.next_offset!)}>下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedbackEntry({ entry, is_admin }: { entry: feedback_entry; is_admin: boolean }) {
  const [saved, set_saved] = useState(entry);
  const [reply, set_reply] = useState(entry.reply);
  const [resolved, set_resolved] = useState(entry.status === "resolved");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState("");
  const respond = async (event: FormEvent) => {
    event.preventDefault();
    set_busy(true);
    set_error("");
    try {
      const result = await api_request<{ feedback: feedback_entry }>(`/api/v1/feedback/${entry.id}`, {
        method: "PATCH", body: { reply, status: resolved ? "resolved" : "pending" },
      });
      set_saved(result.feedback);
    } catch (failure) {
      set_error(error_message(failure));
    } finally {
      set_busy(false);
    }
  };
  return (
    <article className="feedback-entry">
      <header>
        <div>
          {is_admin && <strong>{entry.display_name}</strong>}
          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString("zh-CN")}</time>
        </div>
        <span className={`feedback-status ${saved.status === "resolved" ? "is-resolved" : ""}`}>
          {saved.status === "resolved" ? "已处理" : saved.reply ? "已回复" : "待查看"}
        </span>
      </header>
      <p className="feedback-message">{entry.message}</p>
      {entry.images.length > 0 && (
        <div className="feedback-images">
          {entry.images.map((image, index) => (
            <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="feedback-image" aria-label={`查看反馈图片 ${index + 1}`}>
              <img src={image.url} alt={`反馈图片 ${index + 1}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {saved.reply && <div className="feedback-reply"><strong>管理员回复</strong><p>{saved.reply}</p></div>}
      {is_admin && (
        <details className="feedback-reply-editor">
          <summary>{saved.reply ? "修改回复" : "回复反馈"}</summary>
          <form onSubmit={(event) => void respond(event)}>
            <label htmlFor={`feedback-reply-${entry.id}`}>回复内容</label>
            <textarea id={`feedback-reply-${entry.id}`} value={reply} onChange={(event) => set_reply(event.target.value)} maxLength={2000} rows={3} required disabled={busy} />
            <label className="feedback-resolve"><input type="checkbox" checked={resolved} onChange={(event) => set_resolved(event.target.checked)} disabled={busy} /> 标记为已处理</label>
            {error && <p className="account-error" role="alert">{error}</p>}
            <button className="secondary-button" type="submit" disabled={busy || !reply.trim()}>{busy ? "保存中…" : "保存回复"}</button>
          </form>
        </details>
      )}
    </article>
  );
}

function error_message(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}
