import { useEffect, useState, type ReactNode } from "react";
import { api_error, api_request } from "@/features/api/client";

export function CapacityGate({ children }: { children: ReactNode }) {
  const [state, set_state] = useState<"loading" | "ready" | "busy">("loading");
  const [message, set_message] = useState("");
  const [attempt, set_attempt] = useState(0);
  useEffect(() => {
    let active = true;
    const heartbeat = async () => {
      try {
        await api_request("/api/v1/presence", { method: "POST" });
        if (active) set_state("ready");
      } catch (error) {
        if (!active) return;
        // API-free development and offline reading can still use the bundled catalog.
        if (import.meta.env.DEV && (!(error instanceof api_error) || error.status === 404 || error.status === 500)) {
          set_state("ready");
          return;
        }
        set_state("busy");
        set_message(error instanceof Error ? error.message : "连接暂时中断");
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => { if (!document.hidden) void heartbeat(); }, 25_000);
    const visible = () => { if (!document.hidden) void heartbeat(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [attempt]);
  if (state === "ready") return children;
  return <main className="capacity-state">
    <p className="eyebrow">练琴簿</p>
    <h1>{state === "loading" ? "正在打开教材…" : "请稍后再来"}</h1>
    <p role="status">{state === "busy" ? message : "正在连接学习空间"}</p>
    {state === "busy" && <button type="button" className="primary-button" onClick={() => set_attempt((value) => value + 1)}>重新连接</button>}
  </main>;
}
