import { simpmusic_font_profile } from "./font-config.mjs";

export const simpmusic_font_rights_manifest = Object.freeze({
  schema_version: 1,
  manifest_version: "simpmusic-font-rights-v1",
  assets: Object.freeze([
    Object.freeze({
      font_role: "base",
      file_name: simpmusic_font_profile.fonts.base.file_name,
      sha256: simpmusic_font_profile.fonts.base.sha256,
      rights_status: "private_reference",
      license_reference: null,
    }),
    Object.freeze({
      font_role: "accent",
      file_name: simpmusic_font_profile.fonts.accent.file_name,
      sha256: simpmusic_font_profile.fonts.accent.sha256,
      rights_status: "private_reference",
      license_reference: null,
    }),
  ]),
});
