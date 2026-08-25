export interface beyer_title_page_annotation {
  page: number;
  title_numbers: number[];
  label: string;
}

export interface beyer_title_annotation_summary {
  total_count: number;
  first_title_number: number;
  last_title_number: number;
  pages: beyer_title_page_annotation[];
  selected_pages: beyer_title_page_annotation[];
}

const first_special_title_number = 12;
const last_special_title_number = 109;
const first_special_title_page = 22;
const titles_per_full_page = 4;

export const beyer_special_title_total_count =
  last_special_title_number - first_special_title_number + 1;

export const beyer_special_title_page_annotations =
  make_beyer_special_title_page_annotations();

export function get_beyer_title_annotation_for_pages(
  pages: number[],
): beyer_title_annotation_summary {
  const page_set = new Set(pages);
  return {
    total_count: beyer_special_title_total_count,
    first_title_number: first_special_title_number,
    last_title_number: last_special_title_number,
    pages: beyer_special_title_page_annotations,
    selected_pages: beyer_special_title_page_annotations.filter((entry) =>
      page_set.has(entry.page)),
  };
}

function make_beyer_special_title_page_annotations(): beyer_title_page_annotation[] {
  const annotations: beyer_title_page_annotation[] = [];
  let next_title_number = first_special_title_number;
  let page = first_special_title_page;

  while (next_title_number <= last_special_title_number) {
    const title_numbers = Array.from(
      {
        length: Math.min(
          titles_per_full_page,
          last_special_title_number - next_title_number + 1,
        ),
      },
      (_, index) => next_title_number + index,
    );
    annotations.push({
      page,
      title_numbers,
      label: format_title_number_range(title_numbers),
    });
    next_title_number += title_numbers.length;
    page += 1;
  }
  return annotations;
}

function format_title_number_range(title_numbers: number[]): string {
  const first = title_numbers[0];
  const last = title_numbers.at(-1);
  if (first === undefined || last === undefined) {
    return "";
  }
  return first === last ? `第 ${first} 条` : `第 ${first}-${last} 条`;
}
