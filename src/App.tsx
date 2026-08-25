import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { CoursePath } from "@/pages/CoursePath";
import { Account } from "@/pages/Account";
import { Admin } from "@/pages/Admin";
import { Dashboard } from "@/pages/Dashboard";
import { Favorites } from "@/pages/Favorites";
import { JianpuLibrary } from "@/pages/JianpuLibrary";
import { MaterialLibrary } from "@/pages/MaterialLibrary";
import { Management } from "@/pages/Management";
import { Practice } from "@/pages/Practice";
import { Records } from "@/pages/Records";
import { RepertoireLibrary } from "@/pages/RepertoireLibrary";
import { ScoreCalibration } from "@/pages/ScoreCalibration";
import { use_auth_store } from "@/store/useAuthStore";

export default function App() {
  return (
    <HashRouter>
      <RouteScrollReset />
      <AuthBootstrap />
      <Routes>
        <Route path="/" element={<Dashboard />} />
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
    </HashRouter>
  );
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
