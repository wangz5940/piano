export const score_favorites_storage_key = "lianqinbu.score-favorites.v1";
export const repertoire_favorites_storage_key = "lianqinbu.repertoire-favorites.v1";

export type score_favorite_kind =
  | "practice"
  | "repertoire"
  | "material"
  | "jianpu"
  | "calibration";

export interface score_favorite_entry {
  id: string;
  kind: score_favorite_kind;
  title: string;
  subtitle: string;
  href: string;
  source: string;
  updated_at: string;
}

export function load_score_favorites(): score_favorite_entry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(score_favorites_storage_key);
    if (!saved) {
      return load_legacy_repertoire_favorites();
    }

    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupe_favorites(parsed.filter(is_score_favorite_entry));
  } catch {
    return [];
  }
}

function load_legacy_repertoire_favorites(): score_favorite_entry[] {
  const saved = window.localStorage.getItem(repertoire_favorites_storage_key);
  if (!saved) {
    return [];
  }
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = new Date().toISOString();
    return Array.from(new Set(parsed.filter((value): value is string =>
      typeof value === "string" && value.length > 0))).map((id) => ({
      id: `repertoire:${id}`,
      kind: "repertoire",
      title: id,
      subtitle: "热门曲目",
      href: `/曲目#repertoire-${id}`,
      source: "热门曲目",
      updated_at: now,
    }));
  } catch {
    return [];
  }
}

export function save_score_favorites(entries: score_favorite_entry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    score_favorites_storage_key,
    JSON.stringify(dedupe_favorites(entries)),
  );
}

export function upsert_score_favorite(
  entries: score_favorite_entry[],
  entry: Omit<score_favorite_entry, "updated_at"> & { updated_at?: string },
): score_favorite_entry[] {
  const next_entry: score_favorite_entry = {
    ...entry,
    updated_at: entry.updated_at ?? new Date().toISOString(),
  };
  return [
    next_entry,
    ...entries.filter((candidate) => candidate.id !== entry.id),
  ];
}

export function remove_score_favorite(
  entries: score_favorite_entry[],
  id: string,
): score_favorite_entry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function toggle_score_favorite(
  entries: score_favorite_entry[],
  entry: Omit<score_favorite_entry, "updated_at"> & { updated_at?: string },
): score_favorite_entry[] {
  return entries.some((candidate) => candidate.id === entry.id)
    ? remove_score_favorite(entries, entry.id)
    : upsert_score_favorite(entries, entry);
}

export function is_score_favorite(
  entries: readonly score_favorite_entry[],
  id: string,
): boolean {
  return entries.some((entry) => entry.id === id);
}

export function load_repertoire_favorite_ids(): string[] {
  return load_score_favorites()
    .filter((entry) => entry.kind === "repertoire")
    .map((entry) => entry.id.replace(/^repertoire:/u, ""));
}

export function save_repertoire_favorite_ids(ids: string[]): void {
  const existing = load_score_favorites()
    .filter((entry) => entry.kind !== "repertoire");
  const migrated = ids.map((id) => ({
    id: `repertoire:${id}`,
    kind: "repertoire" as const,
    title: id,
    subtitle: "热门曲目",
    href: `/曲目#repertoire-${id}`,
    source: "热门曲目",
    updated_at: new Date().toISOString(),
  }));
  save_score_favorites([...migrated, ...existing]);
}

export function toggle_repertoire_favorite(
  ids: string[],
  id: string,
): string[] {
  return ids.includes(id)
    ? ids.filter((item) => item !== id)
    : [...ids, id];
}

function is_score_favorite_entry(value: unknown): value is score_favorite_entry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.kind === "string" &&
    typeof record.title === "string" &&
    typeof record.subtitle === "string" &&
    typeof record.href === "string" &&
    typeof record.source === "string" &&
    typeof record.updated_at === "string"
  );
}

function dedupe_favorites(entries: score_favorite_entry[]): score_favorite_entry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}
