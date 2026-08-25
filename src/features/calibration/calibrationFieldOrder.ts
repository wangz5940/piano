export const all_calibration_fields = [
  "pitch_name",
  "duration",
  "fingering",
  "hand",
  "measure_number",
  "measure_beats",
  "measure_beat_unit",
  "beat_position",
  "voice",
  "staff",
  "clef",
  "accidental",
  "source_page",
  "source_system",
  "chord",
  "rest",
  "tie",
  "slur",
  "articulation",
  "dynamics",
  "tempo",
  "repeat",
  "pitch_midi",
] as const;

export type calibration_field = typeof all_calibration_fields[number];

export const default_primary_calibration_fields = [
  "pitch_name",
  "duration",
  "fingering",
  "hand",
] as const satisfies readonly calibration_field[];

export const primary_calibration_fields = default_primary_calibration_fields;

export type primary_calibration_field = calibration_field;

const all_order_storage_key = "panio.calibration.field-order.v2";
const primary_fields_storage_key = "panio.calibration.primary-fields.v2";
const legacy_primary_order_storage_key = "panio.calibration.primary-field-order.v1";

export function normalize_calibration_field_order(
  value: unknown,
): calibration_field[] {
  if (!Array.isArray(value)) {
    return [...all_calibration_fields];
  }
  const valid = value.filter(
    (field): field is calibration_field =>
      all_calibration_fields.includes(field as calibration_field),
  );
  const unique = [...new Set(valid)];
  return [
    ...unique,
    ...all_calibration_fields.filter((field) => !unique.includes(field)),
  ];
}

export function normalize_primary_calibration_fields(
  value: unknown,
  order: readonly calibration_field[] = all_calibration_fields,
): calibration_field[] {
  if (!Array.isArray(value)) {
    return [...default_primary_calibration_fields];
  }
  const valid = value.filter(
    (field): field is calibration_field =>
      all_calibration_fields.includes(field as calibration_field),
  );
  const unique = [...new Set(valid)];
  return normalize_calibration_field_order(order)
    .filter((field) => unique.includes(field));
}

export function normalize_primary_field_order(
  value: unknown,
): primary_calibration_field[] {
  if (!Array.isArray(value)) {
    return [...default_primary_calibration_fields];
  }
  return normalize_primary_calibration_fields(value, value);
}

export function move_calibration_field(
  order: readonly calibration_field[],
  field: calibration_field,
  direction: -1 | 1,
): calibration_field[] {
  const normalized = normalize_calibration_field_order(order);
  const index = normalized.indexOf(field);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= normalized.length) {
    return normalized;
  }
  const next = [...normalized];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function move_primary_calibration_field(
  order: readonly primary_calibration_field[],
  field: primary_calibration_field,
  direction: -1 | 1,
): primary_calibration_field[] {
  const normalized = normalize_primary_calibration_fields(order, order);
  const index = normalized.indexOf(field);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= normalized.length) {
    return normalized;
  }
  const next = [...normalized];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function load_calibration_field_order(
  storage?: Pick<Storage, "getItem">,
): calibration_field[] {
  if (!storage) {
    return [...all_calibration_fields];
  }
  try {
    const stored = storage.getItem(all_order_storage_key);
    if (stored) {
      return normalize_calibration_field_order(JSON.parse(stored));
    }
    const legacy_primary_order = normalize_primary_field_order(
      JSON.parse(storage.getItem(legacy_primary_order_storage_key) ?? "null"),
    );
    return normalize_calibration_field_order([
      ...legacy_primary_order,
      ...all_calibration_fields,
    ]);
  } catch {
    return [...all_calibration_fields];
  }
}

export function save_calibration_field_order(
  order: readonly calibration_field[],
  storage?: Pick<Storage, "setItem">,
): void {
  storage?.setItem(
    all_order_storage_key,
    JSON.stringify(normalize_calibration_field_order(order)),
  );
}

export function load_primary_calibration_field_order(
  storage?: Pick<Storage, "getItem">,
): primary_calibration_field[] {
  if (!storage) {
    return [...default_primary_calibration_fields];
  }
  try {
    const order = load_calibration_field_order(storage);
    const stored = storage.getItem(primary_fields_storage_key);
    if (stored) {
      return normalize_primary_calibration_fields(JSON.parse(stored), order);
    }
    return normalize_primary_field_order(
      JSON.parse(storage.getItem(legacy_primary_order_storage_key) ?? "null"),
    );
  } catch {
    return [...default_primary_calibration_fields];
  }
}

export function save_primary_calibration_field_order(
  order: readonly primary_calibration_field[],
  storage?: Pick<Storage, "setItem">,
): void {
  storage?.setItem(
    primary_fields_storage_key,
    JSON.stringify(normalize_primary_calibration_fields(order, order)),
  );
}

export function save_primary_calibration_fields(
  fields: readonly calibration_field[],
  storage?: Pick<Storage, "setItem">,
): void {
  storage?.setItem(
    primary_fields_storage_key,
    JSON.stringify(normalize_primary_calibration_fields(fields)),
  );
}
