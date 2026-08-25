import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  get_simpmusic_font_role,
  simpmusic_font_config_entry,
  simpmusic_font_profile,
} from "./font-config.mjs";
import {
  open_pptx_archive,
  parse_xml_part,
  resolve_presentation_slides,
} from "./ooxml-parser.mjs";
import {
  hash_serialized_source,
  serialize_source,
} from "./source-serializer.mjs";

export const pptx_source_document_schema_version = 1;
export const pptx_source_importer = Object.freeze({
  name: "panio-hymn-pptx",
  version: "pptx-source-v1",
});

const presentation_part_name = "ppt/presentation.xml";
const han_text_pattern = /\p{Script=Han}/u;
const metadata_text_pattern =
  /^(?:[1-7]\s*=\s*[A-G](?:[#b♯♭])?|[2-9]\s*[/／]\s*(?:2|4|8|16)|(?:作?词|作?曲|编曲|调|拍|速度|编号|第\s*\d+\s*首)\s*[:：]?)/iu;
const metadata_shape_pattern =
  /(?:^|[\s_-])(?:title|subtitle|date|footer|slide number)(?:$|[\s_-])|标题|副标题|日期|页脚|幻灯片编号/iu;
const color_element_kinds = Object.freeze(new Map([
  ["a:srgbClr", "srgb"],
  ["a:schemeClr", "scheme"],
  ["a:sysClr", "system"],
  ["a:prstClr", "preset"],
  ["a:scrgbClr", "scrgb"],
  ["a:hslClr", "hsl"],
]));

export async function create_pptx_source_document(source_file) {
  validate_source_file(source_file);

  const archive = await open_pptx_archive(source_file.absolute_path);
  const [presentation, ordered_slides] = await Promise.all([
    parse_xml_part(archive, presentation_part_name),
    resolve_presentation_slides(archive),
  ]);
  const canvas = parse_presentation_canvas(presentation, archive.file_path);
  const slides = await Promise.all(ordered_slides.map(async (slide) => {
    const parsed_slide = await parse_xml_part(archive, slide.part_name);
    return parse_slide(
      parsed_slide,
      slide,
      canvas,
      source_file.source_id,
    );
  }));
  const document_layout = {
    schema_version: pptx_source_document_schema_version,
    document_type: "pptx_source_document",
    source_id: source_file.source_id,
    score_id: source_file.score_id,
    hymn_id: source_file.hymn_id,
    title: source_file.title,
    canvas,
    slides,
  };
  const provenance_seed = build_provenance_seed(source_file);
  const provenance_id =
    `provenance-sha256-${hash_serialized_source(provenance_seed)}`;
  const source_layout = to_source_layout(document_layout, provenance_id);
  const provenance = {
    ...provenance_seed,
    provenance_id,
    source_layout_sha256: hash_serialized_source(source_layout),
  };

  return {
    ...document_layout,
    provenance,
  };
}

export function classify_pptx_run({
  font_family,
  raw_text,
  run_type = "text",
  shape_name = "",
  shape_raw_text = "",
  shape_paragraph_count = 0,
}) {
  const font_role = get_simpmusic_font_role(font_family);

  if (font_role === "base") {
    return "score_base";
  }
  if (font_role === "accent") {
    return "score_accent";
  }
  if (run_type === "line_break" || !String(raw_text).trim()) {
    return "unknown";
  }

  const trimmed_text = String(raw_text).trim();
  const trimmed_shape_text = String(shape_raw_text).trim();
  const compact_metadata_shape =
    metadata_shape_pattern.test(String(shape_name)) &&
    shape_paragraph_count <= 2 &&
    trimmed_shape_text.length <= 80;

  if (
    metadata_text_pattern.test(trimmed_text) ||
    compact_metadata_shape
  ) {
    return "metadata";
  }
  if (
    han_text_pattern.test(trimmed_text) ||
    han_text_pattern.test(trimmed_shape_text)
  ) {
    return "lyrics";
  }
  return "unknown";
}

export function build_source_document_artifacts(source_document) {
  validate_source_document(source_document);

  const source_layout = to_source_layout(
    source_document,
    source_document.provenance.provenance_id,
  );
  const source_layout_sha256 = hash_serialized_source(source_layout);

  if (
    source_document.provenance.source_layout_sha256 !==
    source_layout_sha256
  ) {
    throw new Error(
      `PptxSourceDocument 来源布局哈希不一致：${source_document.source_id}`,
    );
  }

  const provenance = {
    ...source_document.provenance,
    source_layout_sha256,
  };

  return {
    source_layout,
    provenance,
    source_layout_json: serialize_source(source_layout),
    provenance_json: serialize_source(provenance),
  };
}

export async function write_source_document_artifacts(
  output_directory,
  source_document,
) {
  const artifacts = build_source_document_artifacts(source_document);
  await mkdir(output_directory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(output_directory, "source-layout.json"),
      artifacts.source_layout_json,
      { encoding: "utf8", flag: "w" },
    ),
    writeFile(
      resolve(output_directory, "provenance.json"),
      artifacts.provenance_json,
      { encoding: "utf8", flag: "w" },
    ),
  ]);
  return artifacts;
}

function parse_presentation_canvas(presentation, file_path) {
  const slide_size_node = collect_xml_elements(
    presentation,
    "p:sldSz",
  )[0];
  const attributes = slide_size_node?.[":@"] ?? {};
  const cx = parse_required_number(
    attributes.cx,
    `presentation 画布宽度（${file_path}）`,
  );
  const cy = parse_required_number(
    attributes.cy,
    `presentation 画布高度（${file_path}）`,
  );

  return {
    cx,
    cy,
    type: attributes.type ?? null,
  };
}

function parse_slide(
  parsed_slide,
  slide_descriptor,
  canvas,
  source_id,
) {
  const shape_nodes = collect_xml_elements(parsed_slide, "p:sp");
  const shapes = shape_nodes.map((shape_node, shape_index) =>
    parse_shape(
      shape_node,
      shape_index + 1,
      slide_descriptor,
      source_id,
    ));

  return {
    index: slide_descriptor.index,
    presentation_slide_id: slide_descriptor.presentation_slide_id,
    relationship_id: slide_descriptor.relationship_id,
    part_name: slide_descriptor.part_name,
    canvas: { ...canvas },
    shapes,
  };
}

function parse_shape(
  shape_node,
  shape_index,
  slide_descriptor,
  source_id,
) {
  const shape_contents = shape_node["p:sp"] ?? [];
  const non_visual_node = get_direct_xml_element(
    shape_contents,
    "p:nvSpPr",
  );
  const non_visual_contents = non_visual_node?.["p:nvSpPr"] ?? [];
  const common_non_visual_node = get_direct_xml_element(
    non_visual_contents,
    "p:cNvPr",
  );
  const common_attributes = common_non_visual_node?.[":@"] ?? {};
  const shape_properties_node = get_direct_xml_element(
    shape_contents,
    "p:spPr",
  );
  const shape_properties = shape_properties_node?.["p:spPr"] ?? [];
  const transform_node = get_direct_xml_element(
    shape_properties,
    "a:xfrm",
  );
  const transform_contents = transform_node?.["a:xfrm"] ?? [];
  const transform_attributes = transform_node?.[":@"] ?? {};
  const offset_attributes =
    get_direct_xml_element(transform_contents, "a:off")?.[":@"] ?? {};
  const extent_attributes =
    get_direct_xml_element(transform_contents, "a:ext")?.[":@"] ?? {};
  const rotation_raw = parse_optional_number(transform_attributes.rot);
  const text_body_node = get_direct_xml_element(
    shape_contents,
    "p:txBody",
  );
  const text_body_contents = text_body_node?.["p:txBody"] ?? [];
  const paragraph_nodes = get_direct_xml_elements(
    text_body_contents,
    "a:p",
  );
  const shape_raw_text = paragraph_nodes
    .map(extract_paragraph_raw_text)
    .join("\n");
  const shape_id = common_attributes.id ?? null;
  const shape_name = common_attributes.name ?? null;
  const paragraph_context = {
    source_id,
    slide_descriptor,
    shape_id,
    shape_name,
    shape_raw_text,
    shape_paragraph_count: paragraph_nodes.length,
  };
  const paragraphs = paragraph_nodes.map((paragraph_node, index) =>
    parse_paragraph(paragraph_node, index + 1, paragraph_context));

  return {
    index: shape_index,
    shape_id,
    name: shape_name,
    geometry: {
      x: parse_optional_number(offset_attributes.x),
      y: parse_optional_number(offset_attributes.y),
      cx: parse_optional_number(extent_attributes.cx),
      cy: parse_optional_number(extent_attributes.cy),
      rotation: rotation_raw === null ? 0 : rotation_raw / 60000,
      rotation_raw,
    },
    source_slide: {
      source_id,
      slide_index: slide_descriptor.index,
      presentation_slide_id: slide_descriptor.presentation_slide_id,
      slide_part_name: slide_descriptor.part_name,
    },
    raw_text: shape_raw_text,
    paragraphs,
    raw_ooxml: {
      non_visual_properties: clone_xml_fragment(non_visual_node),
      shape_properties: clone_xml_fragment(shape_properties_node),
      text_body_properties: clone_xml_fragment(
        get_direct_xml_element(text_body_contents, "a:bodyPr"),
      ),
      list_style: clone_xml_fragment(
        get_direct_xml_element(text_body_contents, "a:lstStyle"),
      ),
    },
  };
}

function parse_paragraph(paragraph_node, paragraph_index, context) {
  const paragraph_contents = paragraph_node["a:p"] ?? [];
  const paragraph_properties_node = get_direct_xml_element(
    paragraph_contents,
    "a:pPr",
  );
  const paragraph_properties =
    paragraph_properties_node?.["a:pPr"] ?? [];
  const paragraph_attributes = paragraph_properties_node?.[":@"] ?? {};
  const end_properties_node = get_direct_xml_element(
    paragraph_contents,
    "a:endParaRPr",
  );
  const run_nodes = paragraph_contents.filter((child) =>
    Object.prototype.hasOwnProperty.call(child, "a:r") ||
    Object.prototype.hasOwnProperty.call(child, "a:fld") ||
    Object.prototype.hasOwnProperty.call(child, "a:br"));
  const runs = run_nodes.map((run_node, run_index) =>
    parse_run(run_node, run_index + 1, paragraph_index, context));

  return {
    index: paragraph_index,
    raw_text: runs.map((run) => run.raw_text).join(""),
    alignment: paragraph_attributes.algn ?? null,
    level: parse_optional_number(paragraph_attributes.lvl),
    line_spacing: parse_text_spacing(
      paragraph_properties,
      "a:lnSpc",
    ),
    space_before: parse_text_spacing(
      paragraph_properties,
      "a:spcBef",
    ),
    space_after: parse_text_spacing(
      paragraph_properties,
      "a:spcAft",
    ),
    runs,
    raw_ooxml: {
      properties: clone_xml_fragment(paragraph_properties_node),
      end_paragraph_run_properties:
        clone_xml_fragment(end_properties_node),
    },
  };
}

function parse_run(run_node, run_index, paragraph_index, context) {
  const run_element = get_run_element(run_node);
  const run_contents = run_node[run_element] ?? [];
  const run_properties_node = get_direct_xml_element(
    run_contents,
    "a:rPr",
  );
  const run_properties = run_properties_node?.["a:rPr"] ?? [];
  const attributes = run_properties_node?.[":@"] ?? {};
  const font = parse_font(run_properties);
  const run_type = get_run_type(run_element);
  const raw_text = run_type === "line_break"
    ? "\n"
    : get_direct_xml_elements(run_contents, "a:t")
      .map((text_node) => extract_xml_text(text_node["a:t"]))
      .join("");

  return {
    index: run_index,
    run_type,
    raw_text,
    font,
    font_family: font.effective,
    font_size_hundredth_points: parse_optional_number(attributes.sz),
    character_spacing_hundredth_points:
      parse_optional_number(attributes.spc),
    color: parse_color(run_properties),
    bold: parse_optional_boolean(attributes.b),
    normalize_h: parse_optional_boolean(attributes.normalizeH),
    classification: classify_pptx_run({
      font_family: font.effective,
      raw_text,
      run_type,
      shape_name: context.shape_name,
      shape_raw_text: context.shape_raw_text,
      shape_paragraph_count: context.shape_paragraph_count,
    }),
    source: {
      source_id: context.source_id,
      slide_index: context.slide_descriptor.index,
      presentation_slide_id:
        context.slide_descriptor.presentation_slide_id,
      slide_part_name: context.slide_descriptor.part_name,
      shape_id: context.shape_id,
      paragraph_index,
      run_index,
    },
    raw_properties: { ...attributes },
    raw_ooxml: {
      element: run_element,
      attributes: { ...(run_node[":@"] ?? {}) },
      children: clone_xml_fragment(run_contents),
    },
  };
}

function parse_font(run_properties) {
  const latin = get_typeface(run_properties, "a:latin");
  const east_asian = get_typeface(run_properties, "a:ea");
  const complex_script = get_typeface(run_properties, "a:cs");
  const symbol = get_typeface(run_properties, "a:sym");

  return {
    latin,
    east_asian,
    complex_script,
    symbol,
    effective: latin ?? east_asian ?? complex_script ?? symbol,
  };
}

function get_typeface(run_properties, element_name) {
  return get_direct_xml_element(run_properties, element_name)?.[":@"]
    ?.typeface ?? null;
}

function parse_color(run_properties) {
  const solid_fill_node = get_direct_xml_element(
    run_properties,
    "a:solidFill",
  );
  const solid_fill_contents = solid_fill_node?.["a:solidFill"] ?? [];

  for (const [element_name, kind] of color_element_kinds) {
    const color_node = get_direct_xml_element(
      solid_fill_contents,
      element_name,
    );

    if (!color_node) {
      continue;
    }

    const color_contents = color_node[element_name] ?? [];
    return {
      kind,
      value: color_node[":@"]?.val ?? null,
      transformations: color_contents.map((transformation_node) => {
        const transformation_element =
          get_xml_element_name(transformation_node);
        return {
          kind: transformation_element?.replace(/^a:/u, "") ?? null,
          attributes: { ...(transformation_node[":@"] ?? {}) },
        };
      }),
    };
  }

  return null;
}

function parse_text_spacing(paragraph_properties, spacing_element_name) {
  const spacing_node = get_direct_xml_element(
    paragraph_properties,
    spacing_element_name,
  );
  const spacing_contents = spacing_node?.[spacing_element_name] ?? [];
  const points_node = get_direct_xml_element(
    spacing_contents,
    "a:spcPts",
  );

  if (points_node) {
    return {
      kind: "hundredth_points",
      value: parse_required_number(
        points_node[":@"]?.val,
        `${spacing_element_name} points`,
      ),
    };
  }

  const percent_node = get_direct_xml_element(
    spacing_contents,
    "a:spcPct",
  );
  if (percent_node) {
    return {
      kind: "thousandth_percent",
      value: parse_required_number(
        percent_node[":@"]?.val,
        `${spacing_element_name} percent`,
      ),
    };
  }
  return null;
}

function extract_paragraph_raw_text(paragraph_node) {
  const paragraph_contents = paragraph_node["a:p"] ?? [];
  return paragraph_contents
    .filter((child) =>
      Object.prototype.hasOwnProperty.call(child, "a:r") ||
      Object.prototype.hasOwnProperty.call(child, "a:fld") ||
      Object.prototype.hasOwnProperty.call(child, "a:br"))
    .map((run_node) => {
      const run_element = get_run_element(run_node);
      if (run_element === "a:br") {
        return "\n";
      }
      return get_direct_xml_elements(
        run_node[run_element] ?? [],
        "a:t",
      )
        .map((text_node) => extract_xml_text(text_node["a:t"]))
        .join("");
    })
    .join("");
}

function extract_xml_text(text_contents) {
  return (text_contents ?? [])
    .filter((child) =>
      Object.prototype.hasOwnProperty.call(child, "#text"))
    .map((child) => String(child["#text"] ?? ""))
    .join("");
}

function get_run_element(run_node) {
  if (Object.prototype.hasOwnProperty.call(run_node, "a:r")) {
    return "a:r";
  }
  if (Object.prototype.hasOwnProperty.call(run_node, "a:fld")) {
    return "a:fld";
  }
  if (Object.prototype.hasOwnProperty.call(run_node, "a:br")) {
    return "a:br";
  }
  throw new Error("段落包含不支持的 run 元素");
}

function get_run_type(run_element) {
  if (run_element === "a:br") {
    return "line_break";
  }
  if (run_element === "a:fld") {
    return "field";
  }
  return "text";
}

function build_provenance_seed(source_file) {
  const font_config_entries = JSON.parse(
    serialize_source(simpmusic_font_config_entry),
  );
  const font_config_hash =
    hash_serialized_source(simpmusic_font_config_entry);

  return {
    schema_version: pptx_source_document_schema_version,
    document_type: "pptx_source_provenance",
    source_id: source_file.source_id,
    score_id: source_file.score_id,
    hymn_id: source_file.hymn_id,
    source_file: source_file.relative_path,
    source_file_name: source_file.file_name,
    source_byte_length: source_file.byte_length,
    source_sha256: source_file.sha256,
    importer: { ...pptx_source_importer },
    font_config_version: simpmusic_font_profile.profile_version,
    font_mapping_version: simpmusic_font_profile.mapping_version,
    font_config: {
      version: simpmusic_font_profile.profile_version,
      mapping_version: simpmusic_font_profile.mapping_version,
      content_sha256: font_config_hash,
      entries: font_config_entries,
    },
  };
}

function to_source_layout(source_document, provenance_id) {
  const {
    provenance: _provenance,
    document_type: _document_type,
    ...layout
  } = source_document;

  return {
    ...layout,
    document_type: "pptx_source_layout",
    provenance_id,
  };
}

function validate_source_file(source_file) {
  const required_fields = [
    "absolute_path",
    "relative_path",
    "file_name",
    "source_id",
    "score_id",
    "hymn_id",
    "title",
    "sha256",
  ];
  const missing_fields = required_fields.filter((field_name) =>
    !source_file?.[field_name]);

  if (missing_fields.length > 0) {
    throw new Error(
      `PPTX 来源文件缺少字段：${missing_fields.join(", ")}`,
    );
  }
  if (!Number.isFinite(source_file.byte_length)) {
    throw new Error("PPTX 来源文件缺少有效 byte_length");
  }
}

function validate_source_document(source_document) {
  if (
    source_document?.document_type !== "pptx_source_document" ||
    source_document.schema_version !==
      pptx_source_document_schema_version ||
    !source_document.provenance
  ) {
    throw new Error("无效的 PptxSourceDocument");
  }
}

function collect_xml_elements(value, element_name, elements = []) {
  if (Array.isArray(value)) {
    for (const child of value) {
      collect_xml_elements(child, element_name, elements);
    }
    return elements;
  }
  if (!value || typeof value !== "object") {
    return elements;
  }

  if (Object.prototype.hasOwnProperty.call(value, element_name)) {
    elements.push(value);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== ":@") {
      collect_xml_elements(child, element_name, elements);
    }
  }
  return elements;
}

function get_direct_xml_elements(children, element_name) {
  return (children ?? []).filter((child) =>
    Object.prototype.hasOwnProperty.call(child, element_name));
}

function get_direct_xml_element(children, element_name) {
  return get_direct_xml_elements(children, element_name)[0] ?? null;
}

function get_xml_element_name(node) {
  return Object.keys(node).find((key) => key !== ":@") ?? null;
}

function parse_required_number(value, label) {
  const parsed_value = Number(value);
  if (!Number.isFinite(parsed_value)) {
    throw new Error(`${label} 不是有效数字：${value}`);
  }
  return parsed_value;
}

function parse_optional_number(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return parse_required_number(value, "OOXML 数值");
}

function parse_optional_boolean(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized_value = String(value).toLowerCase();
  if (["1", "true", "on"].includes(normalized_value)) {
    return true;
  }
  if (["0", "false", "off"].includes(normalized_value)) {
    return false;
  }
  throw new Error(`OOXML 布尔值无效：${value}`);
}

function clone_xml_fragment(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return structuredClone(value);
}
