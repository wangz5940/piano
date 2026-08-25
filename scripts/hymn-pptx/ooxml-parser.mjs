import { readFile } from "node:fs/promises";
import { posix } from "node:path";

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const required_ooxml_parts = Object.freeze([
  "[Content_Types].xml",
  "_rels/.rels",
  "ppt/presentation.xml",
  "ppt/_rels/presentation.xml.rels",
]);

const presentation_part_name = "ppt/presentation.xml";
const presentation_relationships_part_name =
  "ppt/_rels/presentation.xml.rels";
const slide_relationship_type =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";

const xml_parser = new XMLParser({
  allowBooleanAttributes: true,
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: true,
  trimValues: false,
});

export async function open_pptx_archive(file_path) {
  const bytes = await readFile(file_path);
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: true,
    createFolders: false,
  });
  const missing_parts = required_ooxml_parts.filter(
    (part_name) => !zip.file(part_name),
  );

  if (missing_parts.length > 0) {
    throw new Error(
      `PPTX 缺少必要 OOXML 部件：${missing_parts.join(", ")}（${file_path}）`,
    );
  }

  return Object.freeze({
    file_path,
    zip,
  });
}

export function list_archive_part_names(archive) {
  return Object.keys(archive.zip.files)
    .filter((part_name) => !archive.zip.files[part_name].dir)
    .sort(compare_part_names);
}

export function list_slide_part_names(archive) {
  return list_archive_part_names(archive)
    .filter((part_name) => /^ppt\/slides\/slide\d+\.xml$/u.test(part_name))
    .sort((left, right) =>
      get_slide_part_number(left) - get_slide_part_number(right));
}

export async function read_xml_part(archive, part_name) {
  const part = archive.zip.file(part_name);

  if (!part) {
    throw new Error(`OOXML 部件不存在：${part_name}（${archive.file_path}）`);
  }
  if (!is_xml_part_name(part_name)) {
    throw new Error(`OOXML 部件不是 XML：${part_name}（${archive.file_path}）`);
  }

  return part.async("string");
}

export async function parse_xml_part(archive, part_name) {
  const xml = await read_xml_part(archive, part_name);

  try {
    return xml_parser.parse(xml);
  } catch (error) {
    throw new Error(
      `无法解析 OOXML 部件：${part_name}（${archive.file_path}）`,
      { cause: error },
    );
  }
}

export function collect_xml_attribute_values(parsed_xml, attribute_name) {
  const values = [];
  visit_xml_nodes(parsed_xml, (node) => {
    const attributes = node[":@"];
    if (
      attributes &&
      Object.prototype.hasOwnProperty.call(attributes, attribute_name)
    ) {
      values.push(attributes[attribute_name]);
    }
  });
  return values;
}

export async function resolve_presentation_slides(archive) {
  const [presentation, relationships] = await Promise.all([
    parse_xml_part(archive, presentation_part_name),
    parse_xml_part(archive, presentation_relationships_part_name),
  ]);
  const slide_ids = collect_xml_elements(presentation, "p:sldId");
  const relationship_nodes = collect_xml_elements(
    relationships,
    "Relationship",
  );
  const relationships_by_id = new Map();

  for (const relationship_node of relationship_nodes) {
    const attributes = relationship_node[":@"] ?? {};
    const relationship_id = attributes.Id;

    if (!relationship_id) {
      throw new Error(
        `presentation relationship 缺少 Id（${archive.file_path}）`,
      );
    }
    if (relationships_by_id.has(relationship_id)) {
      throw new Error(
        `presentation relationship Id 重复：${relationship_id}（${archive.file_path}）`,
      );
    }
    relationships_by_id.set(relationship_id, attributes);
  }

  return slide_ids.map((slide_id_node, index) => {
    const slide_attributes = slide_id_node[":@"] ?? {};
    const presentation_slide_id = slide_attributes.id;
    const relationship_id = slide_attributes["r:id"];
    const relationship = relationships_by_id.get(relationship_id);

    if (!presentation_slide_id || !relationship_id) {
      throw new Error(
        `presentation 第 ${index + 1} 张幻灯片缺少 id 或 r:id（${archive.file_path}）`,
      );
    }
    if (!relationship) {
      throw new Error(
        `幻灯片关系不存在：${relationship_id}（${archive.file_path}）`,
      );
    }
    if (relationship.Type !== slide_relationship_type) {
      throw new Error(
        `关系 ${relationship_id} 不是幻灯片关系（${archive.file_path}）`,
      );
    }
    if (String(relationship.TargetMode ?? "").toLowerCase() === "external") {
      throw new Error(
        `幻灯片关系不能指向外部资源：${relationship_id}（${archive.file_path}）`,
      );
    }

    const part_name = resolve_relationship_target(
      presentation_part_name,
      relationship.Target,
      archive.file_path,
    );

    if (!archive.zip.file(part_name)) {
      throw new Error(
        `幻灯片关系目标不存在：${part_name}（${archive.file_path}）`,
      );
    }

    return {
      index: index + 1,
      presentation_slide_id,
      relationship_id,
      part_name,
    };
  });
}

export async function inspect_pptx_package(file_path) {
  const archive = await open_pptx_archive(file_path);
  await parse_xml_part(archive, "[Content_Types].xml");
  const slides = await resolve_presentation_slides(archive);

  return {
    slide_count: slides.length,
  };
}

function collect_xml_elements(parsed_xml, element_name) {
  const elements = [];
  visit_xml_nodes(parsed_xml, (node) => {
    if (Object.prototype.hasOwnProperty.call(node, element_name)) {
      elements.push(node);
    }
  });
  return elements;
}

function visit_xml_nodes(value, visitor) {
  if (Array.isArray(value)) {
    for (const child of value) {
      visit_xml_nodes(child, visitor);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  visitor(value);
  for (const [key, child] of Object.entries(value)) {
    if (key !== ":@") {
      visit_xml_nodes(child, visitor);
    }
  }
}

function get_slide_part_number(part_name) {
  const match = part_name.match(/\/slide(?<number>\d+)\.xml$/u);
  return Number(match?.groups?.number ?? Number.MAX_SAFE_INTEGER);
}

function compare_part_names(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function is_xml_part_name(part_name) {
  const normalized_name = part_name.toLowerCase();
  return normalized_name.endsWith(".xml") ||
    normalized_name.endsWith(".rels");
}

function resolve_relationship_target(source_part_name, target, file_path) {
  if (!target) {
    throw new Error(
      `presentation relationship 缺少 Target（${file_path}）`,
    );
  }

  const decoded_target = decode_relationship_target(target, file_path);
  const base_name = posix.dirname(source_part_name);
  const normalized_target = posix.normalize(
    decoded_target.startsWith("/")
      ? decoded_target.slice(1)
      : posix.join(base_name, decoded_target),
  );

  if (
    normalized_target === ".." ||
    normalized_target.startsWith("../") ||
    posix.isAbsolute(normalized_target)
  ) {
    throw new Error(
      `presentation relationship Target 越出 PPTX 包：${target}（${file_path}）`,
    );
  }

  return normalized_target;
}

function decode_relationship_target(target, file_path) {
  try {
    return decodeURI(String(target).replaceAll("\\", "/"));
  } catch (error) {
    throw new Error(
      `presentation relationship Target 无效：${target}（${file_path}）`,
      { cause: error },
    );
  }
}
