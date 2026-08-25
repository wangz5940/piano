import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import {
  get_simpmusic_font_role,
  simpmusic_font_profile,
} from "./font-config.mjs";
import {
  simpmusic_font_rights_manifest,
} from "./font-rights-manifest.mjs";

export const source_svg_schema_version = 1;
export const source_svg_review_scope = "controlled_review";

const emu_per_hundredth_point = 127;
const default_font_size_hundredth_points = 1800;
const source_svg_width = 960;
const source_svg_height = 540;
const default_text_insets = Object.freeze({
  left: 91440,
  top: 45720,
  right: 91440,
  bottom: 45720,
});
const source_layers = Object.freeze([
  Object.freeze({
    key: "content",
    data_layer: "source-content",
    label: "Source text",
  }),
  Object.freeze({
    key: "base",
    data_layer: "score-base",
    label: "SimpMusic Base",
  }),
  Object.freeze({
    key: "accent",
    data_layer: "score-accent",
    label: "SimpMusic Accent",
  }),
]);
const scheme_color_fallbacks = Object.freeze({
  bg1: "#FFFFFF",
  bg2: "#EEECE1",
  dk1: "#000000",
  dk2: "#1F497D",
  lt1: "#FFFFFF",
  lt2: "#EEECE1",
  tx1: "#000000",
  tx2: "#1F497D",
  accent1: "#4F81BD",
  accent2: "#C0504D",
  accent3: "#9BBB59",
  accent4: "#8064A2",
  accent5: "#4BACC6",
  accent6: "#F79646",
  hlink: "#0000FF",
  folHlink: "#800080",
});
const public_output_segments = Object.freeze(new Set([
  "dist",
  "public",
]));

export function convert_source_layout_to_svg(source_layout) {
  validate_source_layout(source_layout);

  return {
    schema_version: source_svg_schema_version,
    document_type: "pptx_source_svg_artifacts",
    review_scope: source_svg_review_scope,
    source_id: source_layout.source_id,
    provenance_id: source_layout.provenance_id,
    font_profile_version: simpmusic_font_profile.profile_version,
    font_rights: build_font_rights_summary(),
    slides: source_layout.slides.map((slide) => ({
      slide_index: slide.index,
      presentation_slide_id: slide.presentation_slide_id,
      slide_part_name: slide.part_name,
      shape_count: slide.shapes.length,
      canvas: Object.freeze({ ...source_layout.canvas }),
      width: source_svg_width,
      height: source_svg_height,
      aspect_ratio: "16:9",
      file_name:
        `slide-${String(slide.index).padStart(3, "0")}.source.svg`,
      svg: render_source_slide_svg(source_layout, slide.index),
    })),
  };
}

export function render_source_slide_svg(source_layout, slide_index) {
  validate_source_layout(source_layout);
  const slide = source_layout.slides.find(
    (candidate) => candidate.index === slide_index,
  );

  if (!slide) {
    throw new RangeError(
      `Source layout ${source_layout.source_id} has no slide ${slide_index}.`,
    );
  }

  validate_slide(slide, source_layout.source_id);
  const { cx, cy } = source_layout.canvas;
  const title =
    `${source_layout.title}, source slide ${slide.index}`;
  const rights_summary = build_font_rights_summary();
  const rights_status = [
    ...new Set(rights_summary.map((entry) => entry.rights_status)),
  ].join(",");
  const metadata = {
    schema_version: source_svg_schema_version,
    document_type: "pptx_source_svg",
    review_scope: source_svg_review_scope,
    source_id: source_layout.source_id,
    provenance_id: source_layout.provenance_id,
    slide_index: slide.index,
    presentation_slide_id: slide.presentation_slide_id,
    slide_part_name: slide.part_name,
    font_profile_version: simpmusic_font_profile.profile_version,
    font_rights: rights_summary,
  };
  const rendered_layers = source_layers.map((layer) =>
    render_layer(source_layout, slide, layer));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="0 0 ${cx} ${cy}"`,
    `  width="${source_svg_width}"`,
    `  height="${source_svg_height}"`,
    '  preserveAspectRatio="xMidYMid meet"',
    '  role="img"',
    `  aria-labelledby="source-svg-title-${slide.index}"`,
    '  data-document-type="pptx-source-svg"',
    `  data-review-scope="${source_svg_review_scope}"`,
    '  data-font-access="controlled-review"',
    `  data-font-rights="${escape_xml_attribute(rights_status)}"`,
    `  data-source-id="${escape_xml_attribute(source_layout.source_id)}"`,
    `  data-provenance-id="${escape_xml_attribute(
      source_layout.provenance_id,
    )}"`,
    `  data-source-slide-index="${slide.index}"`,
    `  data-source-slide-id="${escape_xml_attribute(
      slide.presentation_slide_id,
    )}"`,
    `  data-presentation-slide-id="${escape_xml_attribute(
      slide.presentation_slide_id,
    )}"`,
    `  data-slide-part-name="${escape_xml_attribute(slide.part_name)}">`,
    `  <title id="source-svg-title-${slide.index}">${
      escape_xml_text(title)
    }</title>`,
    `  <metadata>${escape_xml_text(JSON.stringify(metadata))}</metadata>`,
    `  <rect data-source-canvas="true" x="0" y="0" width="${cx}" height="${cy}" fill="#FFFFFF"/>`,
    ...rendered_layers,
    "</svg>",
    "",
  ].join("\n");
}

export async function write_source_svg_artifacts(
  output_directory,
  source_layout,
  { review_scope } = {},
) {
  if (review_scope !== source_svg_review_scope) {
    const error = new Error(
      "Source SVG output requires explicit controlled_review scope.",
    );
    error.code = "SOURCE_SVG_CONTROLLED_REVIEW_REQUIRED";
    throw error;
  }

  assert_controlled_review_output_directory(output_directory);
  const artifacts = convert_source_layout_to_svg(source_layout);
  await mkdir(output_directory, { recursive: true });
  await Promise.all(artifacts.slides.map((slide) =>
    writeFile(resolve(output_directory, slide.file_name), slide.svg, {
      encoding: "utf8",
      flag: "w",
    })));
  return artifacts;
}

function render_layer(source_layout, slide, layer) {
  const shapes = slide.shapes.flatMap((shape) => {
    const shape_layers = collect_shape_layers(shape);
    return shape_layers.has(layer.key)
      ? [render_shape(source_layout, slide, shape, layer.key)]
      : [];
  });

  return [
    `  <g id="source-layer-${layer.key}"`,
    `    data-layer="${layer.data_layer}"`,
    `    data-source-layer="${layer.key}"`,
    `    aria-label="${escape_xml_attribute(layer.label)}">`,
    ...shapes,
    "  </g>",
  ].join("\n");
}

function render_shape(source_layout, slide, shape, layer) {
  validate_shape_geometry(shape, slide, source_layout.source_id);
  const { x, y, cx, cy, rotation } = shape.geometry;
  const rotation_transform = rotation === 0
    ? ""
    : ` transform="rotate(${format_number(rotation)} ${
      format_number(cx / 2)
    } ${format_number(cy / 2)})"`;
  const text_insets = get_text_insets(shape);
  let paragraph_y = text_insets.top;
  const rendered_paragraphs = [];

  for (const paragraph of shape.paragraphs) {
    const rendered = render_paragraph({
      layer,
      paragraph,
      shape,
      slide,
      text_insets,
      initial_y: paragraph_y,
    });
    rendered_paragraphs.push(...rendered.elements);
    paragraph_y = rendered.next_y;
  }

  return [
    '    <g data-node-kind="shape"',
    `      data-source-slide-index="${slide.index}"`,
    `      data-source-slide-id="${escape_xml_attribute(
      slide.presentation_slide_id,
    )}"`,
    `      data-source-shape-id="${escape_xml_attribute(
      shape.shape_id ?? "",
    )}"`,
    `      data-source-shape-index="${shape.index}"`,
    `      data-source-shape-name="${escape_xml_attribute(
      shape.name ?? "",
    )}"`,
    `      data-shape-x="${x}"`,
    `      data-shape-y="${y}"`,
    `      data-shape-cx="${cx}"`,
    `      data-shape-cy="${cy}"`,
    `      data-shape-rotation="${format_number(rotation)}"`,
    `      transform="translate(${x} ${y})">`,
    `      <g${rotation_transform}>`,
    `        <svg x="0" y="0" width="${cx}" height="${cy}" viewBox="0 0 ${cx} ${cy}" overflow="hidden">`,
    `          <rect data-source-shape-bounds="true" x="0" y="0" width="${cx}" height="${cy}" fill="none" pointer-events="all"/>`,
    ...rendered_paragraphs,
    "        </svg>",
    "      </g>",
    "    </g>",
  ].join("\n");
}

function render_paragraph({
  layer,
  paragraph,
  shape,
  slide,
  text_insets,
  initial_y,
}) {
  const paragraph_font_size = get_paragraph_font_size(paragraph);
  const line_height = get_line_height(paragraph, paragraph_font_size);
  let line_y = initial_y +
    get_spacing_emu(paragraph.space_before, paragraph_font_size);
  const lines = split_runs_into_lines(paragraph.runs);
  const elements = [];

  for (const line of lines) {
    const visible_runs = line.filter(
      (run) => get_run_layer(run) === layer,
    );

    if (visible_runs.length > 0) {
      elements.push(render_text_line({
        line_y,
        paragraph,
        paragraph_font_size,
        runs: visible_runs,
        shape,
        slide,
        text_insets,
      }));
    }
    line_y += line_height;
  }

  return {
    elements,
    next_y:
      line_y + get_spacing_emu(paragraph.space_after, paragraph_font_size),
  };
}

function render_text_line({
  line_y,
  paragraph,
  paragraph_font_size,
  runs,
  shape,
  slide,
  text_insets,
}) {
  const alignment = get_paragraph_alignment(
    paragraph.alignment,
    text_insets,
    shape.geometry.cx,
  );
  const rendered_runs = runs.map((run) =>
    render_run(run, paragraph_font_size, shape, slide));

  return [
    `          <text x="${format_number(alignment.x)}"`,
    `            y="${format_number(line_y)}"`,
    `            text-anchor="${alignment.text_anchor}"`,
    '            dominant-baseline="text-before-edge"',
    '            xml:space="preserve"',
    `            data-source-slide-index="${slide.index}"`,
    `            data-source-shape-id="${escape_xml_attribute(
      shape.shape_id ?? "",
    )}"`,
    `            data-source-paragraph-index="${paragraph.index}">`,
    ...rendered_runs,
    "          </text>",
  ].join("\n");
}

function render_run(run, paragraph_font_size, shape, slide) {
  const font_size = get_run_font_size(run, paragraph_font_size);
  const font_family = get_run_font_family(run);
  const fill = get_run_fill(run.color);
  const source_shape_id =
    run.source?.shape_id ?? shape.shape_id ?? "";
  const paragraph_index =
    run.source?.paragraph_index ?? "";
  const run_index = run.source?.run_index ?? run.index;
  const source_run_id = [
    slide.presentation_slide_id,
    source_shape_id,
    paragraph_index,
    run_index,
  ].join(":");
  const attributes = [
    'data-node-kind="run"',
    `data-source-slide-index="${slide.index}"`,
    `data-source-slide-id="${escape_xml_attribute(
      slide.presentation_slide_id,
    )}"`,
    `data-source-shape-id="${escape_xml_attribute(
      source_shape_id,
    )}"`,
    `data-source-paragraph-index="${paragraph_index}"`,
    `data-source-run-index="${run_index}"`,
    `data-source-run-id="${escape_xml_attribute(source_run_id)}"`,
    `data-run-classification="${escape_xml_attribute(
      run.classification ?? "unknown",
    )}"`,
    `data-run-type="${escape_xml_attribute(run.run_type ?? "text")}"`,
    `font-family="${escape_xml_attribute(font_family)}"`,
    `font-size="${format_number(font_size)}"`,
    `fill="${fill}"`,
  ];
  const font_role = get_simpmusic_font_role(run.font_family);

  if (Number.isFinite(run.character_spacing_hundredth_points)) {
    attributes.push(
      `letter-spacing="${format_number(
        run.character_spacing_hundredth_points *
          emu_per_hundredth_point,
      )}"`,
    );
  }
  if (run.bold === true) {
    attributes.push('font-weight="700"');
  }
  if (run.normalize_h !== null && run.normalize_h !== undefined) {
    attributes.push(`data-normalize-h="${String(run.normalize_h)}"`);
  }
  if (font_role) {
    attributes.push(`data-font-role="${font_role}"`);
  }
  if (run.color) {
    attributes.push(
      `data-source-color-kind="${escape_xml_attribute(run.color.kind)}"`,
      `data-source-color-value="${escape_xml_attribute(
        run.color.value ?? "",
      )}"`,
    );
  }

  return `            <tspan ${attributes.join(" ")}>${
    run.run_type === "line_break"
      ? ""
      : escape_xml_text(run.raw_text)
  }</tspan>`;
}

function split_runs_into_lines(runs) {
  const lines = [[]];

  for (const run of runs) {
    if (run.run_type === "line_break") {
      lines[lines.length - 1].push(run);
      lines.push([]);
    } else {
      lines[lines.length - 1].push(run);
    }
  }

  return lines;
}

function collect_shape_layers(shape) {
  const layers = new Set(
    shape.paragraphs.flatMap((paragraph) =>
      paragraph.runs.map(get_run_layer)),
  );

  if (layers.size === 0) {
    layers.add("content");
  }
  return layers;
}

function get_run_layer(run) {
  const font_role = get_simpmusic_font_role(run.font_family);

  if (font_role === "base" || run.classification === "score_base") {
    return "base";
  }
  if (
    font_role === "accent" ||
    run.classification === "score_accent"
  ) {
    return "accent";
  }
  return "content";
}

function get_text_insets(shape) {
  const attributes =
    shape.raw_ooxml?.text_body_properties?.[":@"] ?? {};

  return {
    left: parse_emu_or_default(attributes.lIns, default_text_insets.left),
    top: parse_emu_or_default(attributes.tIns, default_text_insets.top),
    right: parse_emu_or_default(attributes.rIns, default_text_insets.right),
    bottom: parse_emu_or_default(attributes.bIns, default_text_insets.bottom),
  };
}

function get_paragraph_font_size(paragraph) {
  const explicit_run_sizes = paragraph.runs
    .map((run) => run.font_size_hundredth_points)
    .filter(Number.isFinite);
  const end_paragraph_size = Number(
    paragraph.raw_ooxml?.end_paragraph_run_properties?.[":@"]?.sz,
  );
  const hundredth_points = explicit_run_sizes[0] ??
    (Number.isFinite(end_paragraph_size)
      ? end_paragraph_size
      : default_font_size_hundredth_points);

  return hundredth_points * emu_per_hundredth_point;
}

function get_run_font_size(run, paragraph_font_size) {
  return Number.isFinite(run.font_size_hundredth_points)
    ? run.font_size_hundredth_points * emu_per_hundredth_point
    : paragraph_font_size;
}

function get_run_font_family(run) {
  const font_role = get_simpmusic_font_role(run.font_family);

  if (font_role) {
    return run.font_family ??
      simpmusic_font_profile.fonts[font_role].family_names[0];
  }
  return run.font_family || "sans-serif";
}

function get_line_height(paragraph, paragraph_font_size) {
  if (paragraph.line_spacing?.kind === "hundredth_points") {
    return paragraph.line_spacing.value * emu_per_hundredth_point;
  }
  if (paragraph.line_spacing?.kind === "thousandth_percent") {
    return paragraph_font_size *
      (paragraph.line_spacing.value / 100000);
  }
  return paragraph_font_size * 1.2;
}

function get_spacing_emu(spacing, font_size) {
  if (spacing?.kind === "hundredth_points") {
    return spacing.value * emu_per_hundredth_point;
  }
  if (spacing?.kind === "thousandth_percent") {
    return font_size * (spacing.value / 100000);
  }
  return 0;
}

function get_paragraph_alignment(
  alignment,
  text_insets,
  shape_width,
) {
  if (alignment === "ctr") {
    return {
      x: (
        text_insets.left +
        shape_width -
        text_insets.right
      ) / 2,
      text_anchor: "middle",
    };
  }
  if (alignment === "r") {
    return {
      x: shape_width - text_insets.right,
      text_anchor: "end",
    };
  }
  return {
    x: text_insets.left,
    text_anchor: "start",
  };
}

function get_run_fill(color) {
  if (!color) {
    return "#000000";
  }
  if (color.kind === "srgb" && /^[a-f0-9]{6}$/iu.test(color.value ?? "")) {
    return `#${String(color.value).toUpperCase()}`;
  }
  if (color.kind === "scheme") {
    return scheme_color_fallbacks[color.value] ?? "#000000";
  }
  if (
    color.kind === "system" &&
    /^[a-f0-9]{6}$/iu.test(color.value ?? "")
  ) {
    return `#${String(color.value).toUpperCase()}`;
  }
  return "#000000";
}

function build_font_rights_summary() {
  return Object.entries(simpmusic_font_profile.fonts).map(
    ([font_role, font]) => {
      const rights_entry = simpmusic_font_rights_manifest.assets.find(
        (entry) => entry.sha256 === font.sha256,
      );

      return {
        font_role,
        family_names: [...font.family_names],
        sha256: font.sha256,
        rights_status: rights_entry?.rights_status ?? "unknown",
      };
    },
  );
}

function assert_controlled_review_output_directory(output_directory) {
  const absolute_directory = resolve(output_directory);
  const path_segments = absolute_directory.split(sep);
  const public_segment = path_segments.find((segment) =>
    public_output_segments.has(segment));

  if (public_segment) {
    const error = new Error(
      `Source SVG cannot be written under ${public_segment}; it is restricted to controlled review.`,
    );
    error.code = "SOURCE_SVG_PUBLIC_OUTPUT_FORBIDDEN";
    error.output_directory = absolute_directory;
    throw error;
  }
}

function validate_source_layout(source_layout) {
  if (
    source_layout?.document_type !== "pptx_source_layout" ||
    !source_layout.source_id ||
    !source_layout.provenance_id ||
    !Array.isArray(source_layout.slides)
  ) {
    throw new TypeError("Invalid PPTX source layout for SVG conversion.");
  }
  if (
    !Number.isFinite(source_layout.canvas?.cx) ||
    source_layout.canvas.cx <= 0 ||
    !Number.isFinite(source_layout.canvas?.cy) ||
    source_layout.canvas.cy <= 0
  ) {
    throw new TypeError(
      `Source layout ${source_layout.source_id} has an invalid canvas.`,
    );
  }
  if (
    source_layout.canvas.cx * 9 !==
    source_layout.canvas.cy * 16
  ) {
    throw new TypeError(
      `Source layout ${source_layout.source_id} canvas is not 16:9.`,
    );
  }
}

function validate_slide(slide, source_id) {
  if (
    !Number.isInteger(slide.index) ||
    !slide.presentation_slide_id ||
    !slide.part_name ||
    !Array.isArray(slide.shapes)
  ) {
    throw new TypeError(`Source layout ${source_id} has an invalid slide.`);
  }
}

function validate_shape_geometry(shape, slide, source_id) {
  const required_geometry = ["x", "y", "cx", "cy", "rotation"];
  const invalid_fields = required_geometry.filter(
    (field) => !Number.isFinite(shape.geometry?.[field]),
  );

  if (invalid_fields.length > 0) {
    throw new TypeError(
      `Source layout ${source_id} slide ${slide.index} shape ${
        shape.shape_id ?? shape.index
      } has invalid geometry: ${invalid_fields.join(", ")}.`,
    );
  }
}

function parse_emu_or_default(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function format_number(value) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
}

function escape_xml_attribute(value) {
  return escape_xml_text(value).replaceAll('"', "&quot;");
}

function escape_xml_text(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
