export const optional_features = [
  { id: "dashboard", title: "今日练习", copy: "查看每日任务和练习概览。" },
  { id: "courses", title: "课程路径", copy: "按课程顺序学习与跟弹。" },
  { id: "materials", title: "教材谱库", copy: "浏览教材源文件和识谱产物。" },
  { id: "repertoire", title: "热门曲目", copy: "探索教材之外的曲目。" },
  { id: "records", title: "练习记录", copy: "查看历次练习表现。" },
  { id: "calibration", title: "乐谱校对", copy: "登录后可校对；个人修改仅自己可见。" },
  { id: "admin", title: "管理后台", copy: "超管管理账户、访问记录、反馈和内容。" },
] as const;

export type optional_feature = typeof optional_features[number]["id"];
export type feature_switches = Record<optional_feature, boolean>;

export function normalize_feature_switches(value: unknown): feature_switches {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    optional_features.map(({ id }) => [id, record[id] === true]),
  ) as feature_switches;
}
