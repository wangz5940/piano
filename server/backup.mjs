import {
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { open_database } from "./database.mjs";

const project_root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const database_path = resolve(
  project_root,
  process.env.PANIO_DATABASE_PATH ?? "data/panio.sqlite",
);
const backup_root = resolve(
  project_root,
  process.env.PANIO_BACKUP_DIR ?? "backups",
);
const retention_count = parse_positive_integer(process.env.PANIO_BACKUP_RETENTION, 14);
const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
const backup_path = resolve(backup_root, `panio-${timestamp}.sqlite`);

mkdirSync(backup_root, { recursive: true, mode: 0o700 });
const repository = open_database(database_path);

try {
  await backup(repository.raw, backup_path);
} finally {
  repository.close();
}

const verification_database = new DatabaseSync(backup_path, { readOnly: true });
try {
  const version = verification_database.prepare(
    "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
  ).get().version;
  if (Number(version) < 1) {
    throw new Error("备份校验失败：缺少数据库迁移版本");
  }
} finally {
  verification_database.close();
}

const existing_backups = readdirSync(backup_root)
  .filter((name) => /^panio-.*\.sqlite$/.test(name))
  .sort()
  .reverse();
for (const expired_name of existing_backups.slice(retention_count)) {
  rmSync(resolve(backup_root, expired_name), { force: true });
}

console.log(`数据库备份完成：${backup_path}`);
console.log(`保留策略：最近 ${retention_count} 份`);

function parse_positive_integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
