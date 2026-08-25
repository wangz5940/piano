import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hash_password } from "./auth.mjs";
import { open_database } from "./database.mjs";
import { normalize_email } from "./validation.mjs";

const project_root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const database_path = resolve(
  project_root,
  process.env.PANIO_DATABASE_PATH ?? "data/panio.sqlite",
);
const email = normalize_email(process.env.PANIO_ADMIN_EMAIL);
const display_name = String(process.env.PANIO_ADMIN_NAME ?? "练琴簿管理员").trim();
const raw_password = process.env.PANIO_ADMIN_PASSWORD;

if (!raw_password) {
  throw new Error("缺少 PANIO_ADMIN_PASSWORD");
}
if (!display_name || [...display_name].length > 40) {
  throw new Error("PANIO_ADMIN_NAME 长度必须在 1—40 个字符之间");
}

const password = await hash_password(raw_password);
const repository = open_database(database_path);

try {
  const existing = repository.find_user_by_email(email);
  let user;
  if (existing) {
    user = repository.update_user_credentials(existing.id, {
      display_name,
      ...password,
    });
    user = repository.update_user_role(existing.id, "admin");
    repository.delete_user_sessions(existing.id);
  } else {
    user = repository.create_user({
      email,
      display_name,
      role: "admin",
      ...password,
    });
  }
  repository.record_audit_event({
    actor_user_id: user.id,
    action: existing ? "admin.bootstrap.update" : "admin.bootstrap.create",
    target_type: "user",
    target_id: user.id,
  });
  console.log(`管理员账号已就绪：${user.email}`);
  console.log("现有登录会话已失效，请使用新密码登录。");
} finally {
  repository.close();
}
