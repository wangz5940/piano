import { group_material_by_content } from "./contentGrouping";
import type { jianpu_material, jianpu_segment } from "./types";

/** Apply reading visibility after splitting works, preserving their source ranges. */
export function get_reading_material(material: jianpu_material): jianpu_material {
  const grouped = group_material_by_content(material);
  if (grouped.id !== "beyer") return grouped;

  const first_exercise = grouped.segments.findIndex((segment) =>
    segment.source_pages.includes(24) && /^练习\s*13(?:\D|$)/u.test(segment.title));
  const segments = (first_exercise < 0 ? grouped.segments : grouped.segments.slice(first_exercise))
    .filter((segment) => segment.source_pages.every((page) => page >= 24));
  return {
    ...grouped,
    segments,
    pages: grouped.pages.filter((page) => page.page >= 24),
    chapters: grouped.chapters
      .filter((chapter) => chapter.page_end >= 24)
      .map((chapter) => ({ ...chapter, page_start: Math.max(24, chapter.page_start) })),
  };
}

export function get_reading_score_number(material: jianpu_material, segment: jianpu_segment): string {
  const index = material.segments.findIndex((item) => item.id === segment.id);
  const first_number = material.id === "beyer" ? 13 : 1;
  return String(index < 0 ? segment.sequence : index + first_number).padStart(3, "0");
}
