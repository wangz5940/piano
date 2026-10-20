const embedded_font_urls = [
  ["SimpMusic Base", "/__simpmusic-fonts/SimpMusicBase.ttf"],
  ["SimpMusic Accent", "/__simpmusic-fonts/SimpMusicAccent.ttf"],
] as const;
export const score_image_style_properties = [
  "color",
  "display",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "transform",
  "transform-box",
  "transform-origin",
  "vector-effect",
  "visibility",
] as const;
const maximum_page_height = 7_000;
const maximum_canvas_dimension = 16_000;
const maximum_canvas_area = 64_000_000;
let embedded_fonts_request: Promise<string> | undefined;

interface svg_page {
  source_index: number;
  page_index: number;
  offset: number;
  height: number;
}

interface rendered_page {
  blob: Blob;
  width: number;
  height: number;
}

export async function download_score_images(
  container: HTMLElement,
  requested_name: string,
): Promise<number> {
  const svgs = [...container.querySelectorAll("svg")]
    .filter((svg) =>
      !svg.closest(".score-zoom-toolbar") &&
      svg.getBoundingClientRect().width > 0 &&
      svg.getBoundingClientRect().height > 0);
  if (svgs.length === 0) throw new Error("score_image_missing");

  await document.fonts.ready;
  const font_styles = await load_embedded_font_styles();
  const pages = svgs.flatMap((svg, source_index) =>
    split_svg_pages(svg.getBoundingClientRect().height, source_index));
  const rendered_pages: rendered_page[] = [];
  for (const page of pages) {
    const svg = svgs[page.source_index];
    rendered_pages.push(await rasterize_svg_page(svg, page, font_styles));
  }
  const image = await combine_rendered_pages(rendered_pages);

  const base_name = sanitize_score_image_name(requested_name);
  trigger_blob_download(image, `${base_name}.png`);
  return 1;
}

export function sanitize_score_image_name(value: string): string {
  const without_control_characters = [...value]
    .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
    .join("");
  const normalized = without_control_characters.trim()
    .replace(/[<>:"/\\|?*]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[.\s-]+$/gu, "")
    .slice(0, 96);
  return normalized || "曲谱";
}

export function split_svg_pages(height: number, source_index = 0): svg_page[] {
  const page_count = Math.max(1, Math.ceil(height / maximum_page_height));
  return Array.from({ length: page_count }, (_, page_index) => ({
    source_index,
    page_index,
    offset: page_index * maximum_page_height,
    height: Math.min(maximum_page_height, height - page_index * maximum_page_height),
  }));
}

export function get_combined_image_scale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(
    1,
    maximum_canvas_dimension / width,
    maximum_canvas_dimension / height,
    Math.sqrt(maximum_canvas_area / (width * height)),
  );
}

async function rasterize_svg_page(
  source: SVGSVGElement,
  page: svg_page,
  font_styles: string,
): Promise<rendered_page> {
  const source_rect = source.getBoundingClientRect();
  const source_view_box = source.viewBox.baseVal;
  const view_box = source_view_box.width > 0 && source_view_box.height > 0
    ? {
        x: source_view_box.x,
        y: source_view_box.y,
        width: source_view_box.width,
        height: source_view_box.height,
      }
    : { x: 0, y: 0, width: source_rect.width, height: source_rect.height };
  const unit_scale = view_box.height / source_rect.height;
  const clone = source.cloneNode(true) as SVGSVGElement;
  copy_computed_svg_styles(source, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(source_rect.width));
  clone.setAttribute("height", String(page.height));
  clone.setAttribute(
    "viewBox",
    [
      view_box.x,
      view_box.y + page.offset * unit_scale,
      view_box.width,
      page.height * unit_scale,
    ].join(" "),
  );
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = font_styles;
  clone.prepend(style);
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("x", String(view_box.x));
  background.setAttribute("y", String(view_box.y + page.offset * unit_scale));
  background.setAttribute("width", String(view_box.width));
  background.setAttribute("height", String(page.height * unit_scale));
  background.setAttribute("fill", "#fffdf8");
  clone.insertBefore(background, style.nextSibling);

  const scale = Math.min(
    2,
    maximum_canvas_dimension / source_rect.width,
    maximum_canvas_dimension / page.height,
    Math.sqrt(maximum_canvas_area / (source_rect.width * page.height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source_rect.width * scale));
  canvas.height = Math.max(1, Math.round(page.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("score_image_canvas_unavailable");

  const serialized = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("score_image_encoding_failed"));
    }, "image/png");
  });
  return { blob, width: canvas.width, height: canvas.height };
}

async function combine_rendered_pages(pages: rendered_page[]): Promise<Blob> {
  if (pages.length === 1) return pages[0].blob;
  const source_width = Math.max(...pages.map((page) => page.width));
  const source_height = pages.reduce((total, page) => total + page.height, 0);
  const scale = get_combined_image_scale(source_width, source_height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source_width * scale));
  canvas.height = Math.max(1, Math.round(source_height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("score_image_canvas_unavailable");
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const page of pages) {
    const image = new Image();
    const url = URL.createObjectURL(page.blob);
    try {
      image.src = url;
      await image.decode();
      context.drawImage(
        image,
        0,
        Math.round(y * scale),
        Math.round(page.width * scale),
        Math.round(page.height * scale),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
    y += page.height;
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("score_image_encoding_failed"));
    }, "image/png");
  });
}

function copy_computed_svg_styles(source: Element, clone: Element): void {
  const computed = getComputedStyle(source);
  const style = (clone as SVGElement).style;
  for (const property of score_image_style_properties) {
    const value = computed.getPropertyValue(property);
    if (value) style.setProperty(property, value);
  }
  let source_child = source.firstElementChild;
  let clone_child = clone.firstElementChild;
  while (source_child && clone_child) {
    copy_computed_svg_styles(source_child, clone_child);
    source_child = source_child.nextElementSibling;
    clone_child = clone_child.nextElementSibling;
  }
}

function load_embedded_font_styles(): Promise<string> {
  embedded_fonts_request ??= Promise.all(embedded_font_urls.map(async ([family, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`score_image_font_${response.status}`);
    const data_url = await blob_to_data_url(await response.blob());
    return `@font-face{font-family:"${family}";src:url("${data_url}") format("truetype");}`;
  })).then((rules) => rules.join(""));
  return embedded_fonts_request;
}

function blob_to_data_url(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("score_image_font_read_failed"));
    reader.readAsDataURL(blob);
  });
}

function trigger_blob_download(blob: Blob, file_name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file_name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
