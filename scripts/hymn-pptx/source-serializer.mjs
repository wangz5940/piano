import { createHash } from "node:crypto";

export function serialize_source(source) {
  return `${JSON.stringify(sort_json_value(source), null, 2)}\n`;
}

export function hash_serialized_source(source) {
  return createHash("sha256")
    .update(serialize_source(source), "utf8")
    .digest("hex");
}

function sort_json_value(value) {
  if (Array.isArray(value)) {
    return value.map(sort_json_value);
  }

  if (!is_plain_object(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort(compare_keys)
      .map((key) => [key, sort_json_value(value[key])]),
  );
}

function is_plain_object(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compare_keys(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
