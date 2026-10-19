import { useEffect, useState } from "react";
import type { account_user } from "@/features/auth/types";
import { api_request } from "@/features/api/client";
import { clear_jianpu_library_cache } from "@/features/jianpu/loadJianpuLibrary";
import { clear_material_asset_cache } from "@/features/assets/loadCatalog";
import { load_musicxml_text } from "@/features/assets/loadCatalog";
import { MusicXmlScoreRenderer } from "@/features/assets/MusicXmlScoreRenderer";
import { CalibrationPreview } from "./CalibrationPreview";
import type { calibration_project } from "./types";

interface submission {
  id: string;
  title: string;
  display_name?: string;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  created_at: string;
  input?: { project: calibration_project; material_id: string; segment_id: string };
}

export function CalibrationReviews({ user, refresh_version }: {
  user: account_user; refresh_version: number;
}) {
  const [items, set_items] = useState<submission[]>([]);
  const [selected, set_selected] = useState<submission>();
  const [original, set_original] = useState<string>();
  const [message, set_message] = useState("");
  const [busy, set_busy] = useState(false);
  const [version, set_version] = useState(0);
  const [note, set_note] = useState("");
  useEffect(() => {
    let active = true;
    void api_request<{ submissions: submission[] }>("/api/v1/calibrations/submissions")
      .then((result) => { if (active) set_items(result.submissions); })
      .catch((error: Error) => { if (active) set_message(error.message); });
    return () => { active = false; };
  }, [user.id, refresh_version, version]);

  const inspect = async (id: string) => {
    set_busy(true);
    set_message("");
    set_original(undefined);
    try {
      const { submission } = await api_request<{ submission: submission }>(`/api/v1/calibrations/submissions/${id}`);
      set_selected(submission);
      const { load_jianpu_catalog } = await import("@/features/jianpu/loadJianpuLibrary");
      const catalog = await load_jianpu_catalog();
      const input = submission.input!;
      const segment = catalog.materials.find((item) => item.id === input.material_id)
        ?.segments.find((item) => item.id === input.segment_id);
      if (segment) set_original(await load_musicxml_text(segment.musicxml_url));
    } catch (error) {
      set_message(error instanceof Error ? error.message : "无法读取校对记录");
    } finally { set_busy(false); }
  };
  const review = async (decision: "approve" | "reject") => {
    if (!selected) return;
    set_busy(true);
    try {
      await api_request(`/api/v1/calibrations/submissions/${selected.id}`, {
        method: "POST", body: { decision, note },
      });
      clear_jianpu_library_cache();
      clear_material_asset_cache();
      set_selected(undefined);
      set_note("");
      set_version((value) => value + 1);
      set_message(decision === "approve" ? "已审批通过，公共原谱已更新。" : "已退回校对。");
    } catch (error) {
      set_message(error instanceof Error ? error.message : "审批失败");
    } finally { set_busy(false); }
  };
  return <details className="calibration-reviews">
    <summary>{user.role === "admin" ? "校对审批" : "我的提交"} · {items.filter((item) => item.status === "pending").length} 份待审批</summary>
    {message && <p role="status">{message}</p>}
    {items.length === 0 && <p>暂无校对提交。</p>}
    <div className="calibration-review-list">
      {items.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void inspect(item.id)}>
        <strong>{item.title}</strong>
        <span>{item.display_name} · {new Date(item.created_at).toLocaleDateString()} · {{
          pending: "待审批", approved: "已通过", rejected: "已退回",
        }[item.status]}{item.review_note ? ` · ${item.review_note}` : ""}</span>
      </button>)}
    </div>
    {selected?.input && <section aria-label="校对审批对照">
      <div className="calibration-review-comparison">
        <div><h3>当前公共原谱</h3>{original && <MusicXmlScoreRenderer musicxml_text={original} />}</div>
        <div><h3>提交的校对稿</h3><CalibrationPreview document={selected.input.project.document}
          event_metadata={selected.input.project.event_metadata} mode="staff" /></div>
      </div>
      {user.role === "admin" && selected.status === "pending" && <div className="calibration-header-actions">
        <input aria-label="审批说明" placeholder="退回说明（选填）" maxLength={500} value={note} onChange={(event) => set_note(event.target.value)} />
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void review("reject")}>退回</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void review("approve")}>通过并更新公共原谱</button>
      </div>}
    </section>}
  </details>;
}
