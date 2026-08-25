import type { score_source_status } from "@/features/course/types";
import type { material_id } from "./types";

export interface material_score_source {
  material_id: material_id;
  title: string;
  catalog_path: string;
  source_status: score_source_status;
  guidance: string;
}

export const material_score_sources: Record<material_score_source["material_id"], material_score_source> = {
  beyer: {
    material_id: "beyer",
    title: "拜厄钢琴基本教程",
    catalog_path: "/materials/catalog.json",
    source_status: "needs_review",
    guidance: "候选谱只用于教材谱库核对；正式课程先使用手动教材练习。",
  },
  hanon: {
    material_id: "hanon",
    title: "哈农钢琴练指法",
    catalog_path: "/materials/catalog.json",
    source_status: "needs_review",
    guidance: "第 13 周后每次最多 3—5 分钟；候选谱未发布前只作核对。",
  },
  "john-thompson-easiest-1": {
    material_id: "john-thompson-easiest-1",
    title: "约翰·汤普森简易钢琴教程 1",
    catalog_path: "/materials/catalog.json",
    source_status: "needs_review",
    guidance: "作为小汤第一册原谱核对资源；正式练习仍以课程指定预备谱为准。",
  },
  "john-thompson-easiest-2": {
    material_id: "john-thompson-easiest-2",
    title: "约翰·汤普森简易钢琴教程 2",
    catalog_path: "/materials/catalog.json",
    source_status: "needs_review",
    guidance: "作为小汤第二册原谱核对资源；正式练习仍以课程指定预备谱为准。",
  },
};

export function get_material_score_source(material_id: material_score_source["material_id"]): material_score_source {
  return material_score_sources[material_id];
}
