import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { simpmusic_font_rights_manifest } from "./font-rights-manifest.mjs";

export class SimpMusicFontRightsError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SimpMusicFontRightsError";
    Object.assign(this, details);
  }
}

export function assert_public_font_copy_allowed({
  font_hash,
  rights_manifest = simpmusic_font_rights_manifest,
}) {
  const rights_entry = rights_manifest.assets.find(
    (entry) => entry.sha256 === font_hash,
  );
  const rights_status = rights_entry?.rights_status ?? "unknown";

  if (rights_status !== "licensed") {
    throw new SimpMusicFontRightsError(
      `Public copy of SimpMusic font ${font_hash} is forbidden: rights status is ${rights_status}.`,
      {
        code: "SIMPMUSIC_FONT_PUBLIC_COPY_FORBIDDEN",
        font_hash,
        rights_status,
      },
    );
  }

  return rights_entry;
}

export async function copy_simpmusic_font_to_public({
  source_path,
  destination_path,
  font_hash,
  rights_manifest = simpmusic_font_rights_manifest,
}) {
  assert_public_font_copy_allowed({
    font_hash,
    rights_manifest,
  });
  const actual_sha256 = await sha256_file(source_path);
  if (actual_sha256 !== font_hash) {
    throw new SimpMusicFontRightsError(
      `SimpMusic public copy source hash mismatch at ${source_path}.`,
      {
        code: "SIMPMUSIC_FONT_COPY_HASH_MISMATCH",
        font_hash,
        actual_sha256,
      },
    );
  }

  await mkdir(dirname(destination_path), { recursive: true });
  await copyFile(source_path, destination_path);

  return Object.freeze({
    source_path,
    destination_path,
    font_hash,
  });
}

async function sha256_file(file_path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(file_path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}
