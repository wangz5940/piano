import { lazy, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { PageBoundary } from "@/components/PageBoundary";
import { CapacityGate } from "@/components/CapacityGate";
import { api_request } from "@/features/api/client";
import { Dashboard } from "@/pages/Dashboard";
import { page_loaders } from "@/pageLoaders";
import { use_auth_store } from "@/store/useAuthStore";
import { use_app_settings_store } from "@/store/useAppSettingsStore";

const CoursePath = lazy(page_loaders.course);
const Account = lazy(page_loaders.account);
const Admin = lazy(page_loaders.admin);
const Favorites = lazy(page_loaders.favorites);
const JianpuLibrary = lazy(page_loaders.jianpu);
const MaterialLibrary = lazy(page_loaders.materials);
const Management = lazy(page_loaders.management);
const Practice = lazy(page_loaders.practice);
const Records = lazy(page_loaders.records);
const RepertoireLibrary = lazy(page_loaders.repertoire);
const ScoreCalibration = lazy(page_loaders.calibration);

export default function App() {
  return (
    <HashRouter>
      <CapacityGate>
      <RouteScrollReset />
      <AuthBootstrap />
      <RouteAccessLogger />
      <PageBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/收藏" element={<Favorites />} />
          <Route path="/课程" element={<CoursePath />} />
          <Route path="/教材" element={<MaterialLibrary />} />
          <Route path="/教材/:material_id/:segment_id" element={<MaterialLibrary />} />
          <Route path="/简谱教材" element={<JianpuLibrary />} />
          <Route path="/简谱教材/:material_id" element={<JianpuLibrary />} />
          <Route path="/简谱教材/:material_id/章节/:chapter_id" element={<JianpuLibrary />} />
          <Route path="/简谱教材/:material_id/:segment_id" element={<JianpuLibrary />} />
          <Route path="/曲目" element={<RepertoireLibrary />} />
          <Route path="/练习/:lesson_id" element={<Practice />} />
          <Route path="/记录" element={<Records />} />
          <Route path="/管理" element={<Management />} />
          <Route path="/账号" element={<Account />} />
          <Route path="/校准" element={<ScoreCalibration />} />
          <Route path="/后台" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageBoundary>
      </CapacityGate>
    </HashRouter>
  );
}

function HomePage() {
  const enabled = use_app_settings_store((state) => state.feature_switches.dashboard);
  return enabled ? <Dashboard /> : <Navigate to="/简谱教材" replace />;
}

function AuthBootstrap() {
  const initialize = use_auth_store((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return null;
}

function RouteScrollReset() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return null;
}

function RouteAccessLogger() {
  const location = useLocation();
  const user_id = use_auth_store((state) => state.user?.id);

  useEffect(() => {
    if (!user_id) {
      return;
    }
    const path = `${location.pathname}${location.search}`;
    const timeout = window.setTimeout(() => {
      void api_request("/api/v1/access-events", {
        method: "POST",
        body: { path },
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [location.pathname, location.search, user_id]);

  return null;
}
