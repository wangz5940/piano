export const page_loaders = {
  favorites: () => import("./pages/Favorites").then((page) => ({ default: page.Favorites })),
  course: () => import("./pages/CoursePath").then((page) => ({ default: page.CoursePath })),
  materials: () => import("./pages/MaterialLibrary").then((page) => ({ default: page.MaterialLibrary })),
  jianpu: () => import("./pages/JianpuLibrary").then((page) => ({ default: page.JianpuLibrary })),
  repertoire: () => import("./pages/RepertoireLibrary").then((page) => ({ default: page.RepertoireLibrary })),
  practice: () => import("./pages/Practice").then((page) => ({ default: page.Practice })),
  records: () => import("./pages/Records").then((page) => ({ default: page.Records })),
  management: () => import("./pages/Management").then((page) => ({ default: page.Management })),
  account: () => import("./pages/Account").then((page) => ({ default: page.Account })),
  calibration: () => import("./pages/ScoreCalibration").then((page) => ({ default: page.ScoreCalibration })),
  admin: () => import("./pages/Admin").then((page) => ({ default: page.Admin })),
};

const navigation_loaders: Record<string, () => Promise<unknown>> = {
  "/收藏": page_loaders.favorites,
  "/课程": page_loaders.course,
  "/教材": page_loaders.materials,
  "/简谱教材": page_loaders.jianpu,
  "/曲目": page_loaders.repertoire,
  "/记录": page_loaders.records,
  "/管理": page_loaders.management,
  "/账号": page_loaders.account,
  "/校准": page_loaders.calibration,
  "/后台": page_loaders.admin,
};

export function preload_page(path: string): void {
  void navigation_loaders[path]?.().catch(() => {
    // An optional prefetch must never prevent navigation or a subsequent retry.
  });
}
