import type { jianpu_material, jianpu_page_slice, jianpu_segment } from "./types";

const continuation_suffix = /[（(](?:第[一二三四五六七八九十\d、，,至—-]+行|[上中下]|续(?:页)?)[）)]$/u;

export function complete_work_title(title: string): string {
  return title.trim().replace(continuation_suffix, "").trim();
}

/** A reading index over immutable source ranges; no notes or source IDs are rewritten. */
export function group_material_by_content(material: jianpu_material): jianpu_material {
  if (material.source_segments) return material;
  const works: jianpu_segment[] = [];
  let preceding_title = "";
  for (const segment of material.segments) {
    const sections = segment.content_sections ?? [{
      ...segment.page_slices[0],
      title: segment.title,
      source_pages: segment.source_pages,
      measure_start: 1,
      measure_end: segment.measure_count,
    }];
    assert_complete_ranges(segment, sections);
    for (const section of sections) {
      const title = complete_work_title(section.title);
      const length = section.measure_end - section.measure_start + 1;
      const source = {
        segment_id: segment.id,
        musicxml_url: segment.musicxml_url,
        jianpu_url: segment.jianpu_url,
        measure_start: section.measure_start,
        measure_end: section.measure_end,
        title: section.title,
      };
      const previous = works.at(-1);
      const is_continuation = section.continues ||
        continuation_suffix.test(section.title) || continuation_suffix.test(preceding_title);
      if (previous && previous.title === title && is_continuation) {
        previous.sources!.push(source);
        previous.source_pages = [...new Set([...previous.source_pages, ...section.source_pages])];
        previous.source_page_label = page_label(previous.source_pages);
        previous.measure_count += length;
        previous.page_slices[0].measure_end = previous.measure_count;
        previous.page_slices[0].source_pages = previous.source_pages;
        previous.page_slices[0].text = [...new Set([
          ...previous.page_slices[0].text.split("\n"), ...section.text.split("\n"),
        ])].join("\n");
        previous.has_left_hand ||= segment.has_left_hand;
        if (previous.hand_mode !== segment.hand_mode) previous.hand_mode = "both";
      } else {
        works.push({
          ...segment,
          id: sections.length === 1 ? segment.id : `${segment.id}.work.${section.measure_start}`,
          sequence: works.length + 1,
          title,
          source_pages: [...section.source_pages],
          source_page_label: page_label(section.source_pages),
          measure_count: length,
          section_title: section.chapter_title,
          page_slices: [{ ...section, title, measure_start: 1, measure_end: length }],
          sources: [source],
        });
      }
      preceding_title = section.title;
    }
  }
  return { ...material, source_segments: material.segments, segments: works };
}

function page_label(pages: number[]): string {
  return `原谱第 ${pages.join("、")} 页`;
}

function assert_complete_ranges(segment: jianpu_segment, sections: jianpu_page_slice[]) {
  let next = 1;
  for (const section of sections) {
    if (section.measure_start !== next || section.measure_end < next) {
      throw new Error(`${segment.id} 的乐曲边界不连续`);
    }
    next = section.measure_end + 1;
  }
  if (next !== segment.measure_count + 1) {
    throw new Error(`${segment.id} 的乐曲边界需要重新校对`);
  }
}
