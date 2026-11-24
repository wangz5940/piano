import { useEffect, useReducer, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, ImagePlus, LoaderCircle, Send, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api_error } from "@/features/api/client";
import { load_feedback, submit_feedback, update_feedback } from "./api";
import { feedback_form_reducer, feedback_status_label, initial_feedback_state } from "./model";
import type { feedback_entry, feedback_page } from "./model";
import { feedback_types, validate_feedback } from "./validation.mjs";

const max_image_bytes = 5 * 1024 * 1024;
const image_types = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function FeedbackPanel({
  is_admin, show_composer = true, show_history = true,
}: { is_admin: boolean; show_composer?: boolean; show_history?: boolean }) {
  const [state, dispatch] = useReducer(feedback_form_reducer, initial_feedback_state);
  const { draft, errors } = state;
  const [files, set_files] = useState<File[]>([]);
  const [attachment_error, set_attachment_error] = useState("");
  const [revision, set_revision] = useState(0);
  const [scope, set_scope] = useState<"mine" | "all">(is_admin ? "all" : "mine");
  const in_flight = useRef(false);
  const message_input = useRef<HTMLTextAreaElement>(null);
  const contact_input = useRef<HTMLInputElement>(null);
  const busy = state.status === "submitting";

  const select_files = (incoming: File[]) => {
    set_attachment_error("");
    if (files.length + incoming.length > 4) {
      set_attachment_error("最多上传 4 张图片，请先移除多余图片。"); return;
    }
    if (incoming.some((file) => file.size >= max_image_bytes || file.size === 0)) {
      set_attachment_error("每张图片必须小于 5MB，且不能为空。"); return;
    }
    if (incoming.some((file) => !image_types.has(file.type))) {
      set_attachment_error("请选择 JPG、PNG 或 WebP 图片。"); return;
    }
    set_files((current) => [...current, ...incoming]);
  };
  const reset = () => {
    dispatch({ type: "reset" }); set_files([]); set_attachment_error("");
    window.setTimeout(() => message_input.current?.focus(), 0);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (in_flight.current) return;
    const validation = validate_feedback(draft);
    if (Object.keys(validation).length) {
      dispatch({ type: "invalid", errors: validation });
      if (validation.message) message_input.current?.focus();
      else if (validation.contact) contact_input.current?.focus();
      return;
    }
    in_flight.current = true;
    dispatch({ type: "submit" });
    try {
      await submit_feedback(draft, files);
      dispatch({ type: "success" }); set_revision((value) => value + 1);
    } catch (failure) {
      dispatch({ type: "failure", error: error_message(failure) });
    } finally { in_flight.current = false; }
  };
  return (
    <div className="feedback-submission-panel">
      {show_composer && (state.status === "success" ? (
        <div className="feedback-submitted">
          <p className="feedback-success" role="status"><Check size={20} /> 反馈已提交</p>
          <p>谢谢你的反馈。处理状态和回复会显示在历史反馈中。</p>
          <div className="feedback-success-actions">
            <button type="button" className="secondary-button" onClick={reset}>继续写反馈</button>
            <Link to="/反馈/历史" className="primary-button">查看历史反馈</Link>
          </div>
        </div>
      ) : (
        <form className="feedback-form" noValidate onSubmit={(event) => void submit(event)}>
          <label htmlFor="feedback-type">反馈类型</label>
          <select id="feedback-type" value={draft.feedback_type} disabled={busy}
            aria-invalid={Boolean(errors.feedback_type)} aria-describedby={errors.feedback_type ? "feedback-type-error" : undefined}
            onChange={(event) => dispatch({ type: "change", field: "feedback_type", value: event.target.value })}>
            {feedback_types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          {errors.feedback_type && <p id="feedback-type-error" className="account-error" role="alert">{errors.feedback_type}</p>}
          <label htmlFor="feedback-message">详细内容 <span className="feedback-required">必填 · 至少 10 个字符</span></label>
          <textarea id="feedback-message" ref={message_input} value={draft.message}
            onChange={(event) => dispatch({ type: "change", field: "message", value: event.target.value })}
            placeholder="请描述遇到的问题或希望改进的功能，例如教材、曲目、小节及具体操作…"
            rows={7} required disabled={busy} aria-invalid={Boolean(errors.message)}
            aria-describedby={`feedback-privacy feedback-counter${errors.message ? " feedback-message-error" : ""}`} />
          {errors.message && <p id="feedback-message-error" className="account-error" role="alert">{errors.message}</p>}
          <div className="feedback-form-note">
            <span id="feedback-privacy">仅你和管理员可见。每人每天最多提交 5 条。</span>
            <span id="feedback-counter">{Array.from(draft.message.trim()).length}/2000</span>
          </div>
          <label htmlFor="feedback-contact">联系方式 <span className="feedback-required">选填</span></label>
          <input id="feedback-contact" ref={contact_input} type="text" value={draft.contact} maxLength={254}
            placeholder="邮箱或手机号" autoComplete="off" disabled={busy}
            aria-invalid={Boolean(errors.contact)} aria-describedby={errors.contact ? "feedback-contact-error" : undefined}
            onChange={(event) => dispatch({ type: "change", field: "contact", value: event.target.value })} />
          {errors.contact && <p id="feedback-contact-error" className="account-error" role="alert">{errors.contact}</p>}
          <div className="feedback-attachments">
            <label className={`secondary-button feedback-upload ${busy || files.length >= 4 ? "is-disabled" : ""}`}>
              <ImagePlus size={17} /> 添加图片（{files.length}/4）
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || files.length >= 4}
                aria-label="添加反馈图片" onChange={(event) => {
                  select_files(Array.from(event.target.files ?? [])); event.target.value = "";
                }} />
            </label>
            <small>选填 · 每张小于 5MB · JPG / PNG / WebP</small>
          </div>
          {files.length > 0 && <div className="feedback-images">{files.map((file, index) => (
            <SelectedImage key={`${index}:${file.name}:${file.lastModified}`} file={file} index={index} disabled={busy}
              remove={() => { set_files((current) => current.filter((_, i) => i !== index)); set_attachment_error(""); }} />
          ))}</div>}
          {(state.error || attachment_error) && <p className="account-error" role="alert">{state.error || attachment_error}</p>}
          <div className="feedback-form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="is-spinning" /> : <Send size={17} />}
              {busy ? "正在提交…" : "提交反馈"}
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={reset}>重置表单</button>
          </div>
        </form>
      ))}
      {show_history && <>
        <div className={`feedback-history-heading ${show_composer ? "" : "is-standalone"}`}>
          <h2>{scope === "all" ? "全部反馈" : "我的反馈"}</h2>
          {is_admin && <div className="feedback-scope" role="group" aria-label="反馈范围">
            <button type="button" aria-pressed={scope === "mine"} onClick={() => set_scope("mine")}>我的反馈</button>
            <button type="button" aria-pressed={scope === "all"} onClick={() => set_scope("all")}>全部反馈</button>
          </div>}
        </div>
        <FeedbackHistory key={`${scope}:${revision}`} scope={scope} is_admin={is_admin} />
      </>}
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
    void load_feedback(scope, offset)
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
  const [updated, set_updated] = useState(false);
  const respond = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    set_busy(true);
    set_error("");
    try {
      const result = await update_feedback(entry.id, reply, resolved ? "resolved" : "pending");
      set_updated(true);
      set_saved(result.feedback);
      set_reply(result.feedback.reply);
      set_resolved(result.feedback.status === "resolved");
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
          {feedback_status_label(saved)}
        </span>
      </header>
      <p className="feedback-entry-type">{feedback_types.find((type) => type.value === entry.feedback_type)?.label ?? "其他问题"}</p>
      <p className="feedback-message">{entry.message}</p>
      {entry.contact && <p className="feedback-contact">联系方式：{entry.contact}</p>}
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
          <summary>处理状态与回复</summary>
          <form onSubmit={(event) => void respond(event)}>
            <label htmlFor={`feedback-reply-${entry.id}`}>回复内容</label>
            <textarea id={`feedback-reply-${entry.id}`} value={reply} onChange={(event) => { set_reply(event.target.value); set_updated(false); }} maxLength={2000} rows={3} disabled={busy} />
            <label className="feedback-resolve"><input type="checkbox" checked={resolved} onChange={(event) => { set_resolved(event.target.checked); set_updated(false); }} disabled={busy} /> 标记为已处理</label>
            {error && <p className="account-error" role="alert">{error}</p>}
            {updated && <p className="feedback-success" role="status">处理状态与回复已保存。</p>}
            <button className="secondary-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存状态与回复"}</button>
          </form>
        </details>
      )}
    </article>
  );
}

function error_message(error: unknown) {
  if (error instanceof TypeError || (error instanceof api_error && error.status >= 500)) {
    return "反馈服务暂时不可用，请稍后重试。";
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}
