import { MessageSquare, ArrowLeft, List, PenLine } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import FeedbackPanel from "@/features/feedback/FeedbackPanel";
import { use_auth_store } from "@/store/useAuthStore";

export function Feedback({ mode = "submit" }: { mode?: "submit" | "history" | "admin" }) {
  const user = use_auth_store((state) => state.user);
  const status = use_auth_store((state) => state.status);
  const is_admin = mode === "admin";
  const is_history = mode === "history";
  const title = is_admin ? "反馈管理" : is_history ? "历史反馈" : "反馈与建议";
  return (
    <AppShell>
      <div className="feedback-page">
        <section className="page-intro">
          <div>
            <p className="eyebrow"><MessageSquare size={15} /> 一起改进练琴簿</p>
            <h1>{title}</h1>
            <p>{is_admin ? "查看用户反馈，跟进处理进度并添加回复。" : "遇到问题或有新的想法，都可以在这里告诉我们。"}</p>
          </div>
          {is_admin && <Link to="/后台" className="secondary-button"><ArrowLeft size={16} /> 管理后台</Link>}
        </section>
        {!is_admin && (
          <nav className="feedback-tabs" aria-label="反馈导航">
            <NavLink to="/反馈" end><PenLine size={16} /> 提交反馈</NavLink>
            <NavLink to="/反馈/历史"><List size={16} /> 历史反馈</NavLink>
            {user?.role === "admin" && <NavLink to="/后台/反馈">反馈管理</NavLink>}
          </nav>
        )}
        <section className="feedback-page-card" aria-label={title}>
          {status === "idle" || status === "loading" ? <p>正在加载账号…</p> : !user ? (
            <div className="feedback-login"><h2>登录后{is_history ? "查看历史反馈" : "使用反馈功能"}</h2>
              <p>登录后，你可以跟进反馈处理状态和管理员回复。</p>
              <Link to="/账号" className="primary-button">登录 / 注册</Link>
            </div>
          ) : is_admin && user.role !== "admin" ? (
            <p role="alert">仅管理员可以查看全部反馈。<Link to="/反馈">返回反馈与建议</Link></p>
          ) : (
            <FeedbackPanel key={`${user.id}:${mode}`} is_admin={is_admin}
              show_composer={!is_admin && !is_history} show_history={is_admin || is_history} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
