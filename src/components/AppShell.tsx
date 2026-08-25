import {
  BookOpenText,
  CircleUserRound,
  ClipboardList,
  Heart,
  Home,
  LibraryBig,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

import { use_app_settings_store } from "@/store/useAppSettingsStore";
import { use_auth_store } from "@/store/useAuthStore";

interface app_shell_props {
  children: ReactNode;
}

const navigation_items = [
  { to: "/", label: "今日练习", icon: Home, end: true },
  { to: "/收藏", label: "收藏", icon: Heart },
  { to: "/课程", label: "课程路径", icon: BookOpenText },
  { to: "/教材", label: "教材谱库", icon: LibraryBig },
  { to: "/简谱教材", label: "简谱教材", icon: Music2 },
  { to: "/曲目", label: "热门曲目", icon: Sparkles },
  { to: "/记录", label: "练习记录", icon: ClipboardList },
  { to: "/管理", label: "学习管理", icon: SlidersHorizontal },
  { to: "/账号", label: "账号与同步", icon: CircleUserRound },
];

export function AppShell({ children }: app_shell_props) {
  const sidebar_collapsed = use_app_settings_store((state) => state.sidebar_collapsed);
  const set_sidebar_collapsed = use_app_settings_store((state) => state.set_sidebar_collapsed);
  const user = use_auth_store((state) => state.user);
  const visible_navigation_items = user?.role === "admin"
    ? [
        ...navigation_items,
        { to: "/校准", label: "乐谱校准", icon: ScanSearch },
        { to: "/后台", label: "内容后台", icon: ShieldCheck },
      ]
    : navigation_items;

  return (
    <div className={`app-shell ${sidebar_collapsed ? "is-rail-collapsed" : ""}`}>
      <aside className={`side-rail ${sidebar_collapsed ? "is-collapsed" : ""}`}>
        <NavLink to="/" className="brand-mark" aria-label="返回练琴簿首页">
          <span className="brand-note">♩</span>
          <span className="brand-copy">
            <strong>练琴簿</strong>
            <small>PIANO PRACTICE</small>
          </span>
        </NavLink>

        <button
          type="button"
          className="rail-collapse-toggle"
          onClick={() => set_sidebar_collapsed(!sidebar_collapsed)}
          aria-label={sidebar_collapsed ? "展开主导航" : "收起主导航"}
          aria-expanded={!sidebar_collapsed}
        >
          {sidebar_collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span>{sidebar_collapsed ? "展开导航" : "收起导航"}</span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          {visible_navigation_items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                title={sidebar_collapsed ? item.label : undefined}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="rail-tip">
          <Sparkles size={16} />
          <p className="rail-tip-copy">
            今天只练一个小目标。
            <br />
            让双手慢慢学会合作。
          </p>
        </div>
      </aside>

      <main className="main-content">{children}</main>
      <div className="mobile-nav" aria-label="移动端主导航">
        {visible_navigation_items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mobile-nav-item ${isActive ? "is-active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
