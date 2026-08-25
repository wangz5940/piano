import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import {
  create_empty_review_checklist,
  get_available_material_status_transitions,
  get_material_status_label,
  get_material_status_transition_label,
  get_publish_block_reason,
  review_check_labels,
} from "./policy";
import { transition_material_review } from "./reviewGate";
import type {
  material_review_checklist,
  material_review_record,
  material_review_status,
  material_segment,
} from "./types";

interface material_review_gate_props {
  segment: material_segment;
  review_record: material_review_record | undefined;
  on_transition: (record: material_review_record) => void;
  on_reset: () => void;
}

const check_keys = Object.keys(review_check_labels) as Array<keyof material_review_checklist>;

export function MaterialReviewGate({
  segment,
  review_record,
  on_transition,
  on_reset,
}: material_review_gate_props) {
  const [checks, set_checks] = useState<material_review_checklist>(
    review_record?.checks ?? create_empty_review_checklist(),
  );
  const [note, set_note] = useState(review_record?.note ?? "");
  const [error, set_error] = useState<string>();

  useEffect(() => {
    set_checks(review_record?.checks ?? create_empty_review_checklist());
    set_note(review_record?.note ?? "");
    set_error(undefined);
  }, [review_record, segment.id, segment.sha256]);

  const available_transitions = get_available_material_status_transitions(segment.status)
    .filter((status) => status !== "published");
  const derived_assets_reason = segment.derived_assets
    ? get_publish_block_reason(segment, checks)
    : "缺少本次练习所需的跟弹提示。";
  const publish_block_reason = segment.status !== "verified"
    ? derived_assets_reason ?? "请先标记为已核对，再发布当前版本。"
    : derived_assets_reason;
  const is_published = segment.status === "published";

  const handle_transition = (next_status: material_review_status) => {
    try {
      const record = transition_material_review(
        segment,
        review_record,
        next_status,
        checks,
        note,
      );
      on_transition(record);
      set_error(undefined);
    } catch (transition_error) {
      set_error(transition_error instanceof Error ? transition_error.message : "状态变更失败");
    }
  };

  return (
    <section className="material-review-gate" aria-label="教材审核门禁">
      <header className="material-review-gate-head">
        <div>
          <p className="section-kicker"><ShieldCheck size={15} /> 审核门禁</p>
          <h3>{get_material_status_label(segment.status)}</h3>
        </div>
        <span className={`material-review-status status-${segment.status}`}>
          {segment.realtime_judgement_allowed ? "可用于跟弹" : "不可用于跟弹"}
        </span>
      </header>

      <p className="material-review-gate-copy">
        审核记录只保存在当前浏览器，并绑定当前原谱版本。内容变更后必须重新核对。
      </p>

      <fieldset className="material-review-checklist">
        <legend>审核证据</legend>
        {check_keys.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={checks[key]}
              onChange={(event) => {
                set_checks((current) => ({ ...current, [key]: event.target.checked }));
                set_error(undefined);
              }}
            />
            <span>{review_check_labels[key]}</span>
          </label>
        ))}
      </fieldset>

      <label className="material-review-note">
        <span>审核结论</span>
        <textarea
          value={note}
          onChange={(event) => {
            set_note(event.target.value);
            set_error(undefined);
          }}
          placeholder="例如：第 1—8 小节节奏、声部、来源页均已与原谱核对。"
          rows={3}
        />
        <small>标记已核对、暂不可用、不可使用或发布时必须填写。</small>
      </label>

      <div className="material-review-actions">
        {available_transitions.map((status) => (
          <button
            key={status}
            type="button"
            className={get_action_class_name(status)}
            onClick={() => handle_transition(status)}
          >
            {status === "verified" ? <CheckCircle2 size={16} /> : status === "rejected" ? <XCircle size={16} /> : <CircleAlert size={16} />}
            {get_material_status_transition_label(status)}
          </button>
        ))}
        <button
          type="button"
          className="material-review-action is-publish"
          disabled={Boolean(publish_block_reason) || is_published}
          title={is_published ? "当前版本已发布" : publish_block_reason}
          onClick={() => handle_transition("published")}
        >
          <Send size={16} />
          发布当前版本
        </button>
      </div>

      {publish_block_reason && (
        <p className="material-review-blocked">
          <CircleAlert size={15} />
          发布受阻：{publish_block_reason}
        </p>
      )}

      {error && (
        <p className="material-review-error" role="alert">
          <CircleAlert size={15} />
          {error}
        </p>
      )}

      {review_record && (
        <>
          <div className="material-review-history-head">
            <span>最近审核记录</span>
            <button type="button" onClick={on_reset}>
              <RotateCcw size={14} />
              恢复清单状态
            </button>
          </div>
          <ol className="material-review-history">
            {[...review_record.history].reverse().map((entry) => (
              <li key={`${entry.changed_at}-${entry.to_status}`}>
                <strong>{get_material_status_label(entry.from_status)} → {get_material_status_label(entry.to_status)}</strong>
                <time dateTime={entry.changed_at}>{format_review_time(entry.changed_at)}</time>
                {entry.note && <p>{entry.note}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function get_action_class_name(status: material_review_status): string {
  if (status === "verified") {
    return "material-review-action is-verify";
  }
  if (status === "rejected") {
    return "material-review-action is-reject";
  }
  return "material-review-action";
}

function format_review_time(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return timestamp.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
