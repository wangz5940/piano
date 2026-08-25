import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";

const root_dir = dirname(fileURLToPath(import.meta.url));
const https_key_path = resolve(root_dir, ".cert/panio-dev.key");
const https_cert_path = resolve(root_dir, ".cert/panio-dev.crt");
const use_https = process.env.PANIO_DEV_HTTPS === "1";
const api_origin = process.env.PANIO_API_ORIGIN ?? "http://127.0.0.1:4173";
const simpmusic_font_specs = [
  {
    file_name: "SimpMusicBase.ttf",
    sha256:
      "299d79d5cf40058c70f1c8a5ccedee7cb69142ac444d63925ce6057f9f636797",
  },
  {
    file_name: "SimpMusicAccent.ttf",
    sha256:
      "50da44991631cf8a555381359d0dd91d11143e99ac5c80bd9afb62b08a91c792",
  },
] as const;
const simpmusic_font_directories = [
  resolve(root_dir, "fonts"),
  join(homedir(), "Library", "Fonts"),
  "/Library/Fonts",
  join(homedir(), ".local", "share", "fonts"),
  join(homedir(), ".fonts"),
  "/usr/local/share/fonts",
  "/usr/share/fonts",
];
const simpmusic_font_files = new Map<string, string>(
  simpmusic_font_specs.flatMap((font) => {
    const font_path = simpmusic_font_directories
      .map((directory) => join(directory, font.file_name))
      .find((candidate) => is_verified_font(candidate, font.sha256));
    return font_path ? [[font.file_name, font_path] as const] : [];
  }),
);

function get_https_config() {
  if (!use_https) {
    return undefined;
  }
  if (!existsSync(https_key_path) || !existsSync(https_cert_path)) {
    throw new Error("缺少本地 HTTPS 证书，请先运行 npm run create:cert");
  }
  return {
    key: readFileSync(https_key_path),
    cert: readFileSync(https_cert_path),
  };
}

function is_verified_font(file_path: string, expected_sha256: string): boolean {
  if (!existsSync(file_path) || !statSync(file_path).isFile()) {
    return false;
  }
  const actual_sha256 = createHash("sha256")
    .update(readFileSync(file_path))
    .digest("hex");
  return actual_sha256 === expected_sha256;
}

function simpmusic_font_middleware(): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      next();
      return;
    }
    let file_name: string;
    try {
      file_name = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      ).replace(/^\/+/u, "");
    } catch {
      next();
      return;
    }
    const font_path = simpmusic_font_files.get(file_name);
    if (!font_path) {
      next();
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "font/ttf");
    response.setHeader("Cache-Control", "private, max-age=3600");
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(font_path).on("error", next).pipe(response);
  };
}

function local_simpmusic_font_assets(): Plugin {
  return {
    name: "local-simpmusic-font-assets",
    configureServer(server) {
      server.middlewares.use(
        "/__simpmusic-fonts",
        simpmusic_font_middleware(),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        "/__simpmusic-fonts",
        simpmusic_font_middleware(),
      );
    },
  };
}

export default defineConfig({
  build: {
    sourcemap: "hidden",
  },
  server: {
    https: get_https_config(),
    proxy: {
      "/api": {
        target: api_origin,
        changeOrigin: false,
      },
    },
  },
  plugins: [react(), tsconfigPaths(), local_simpmusic_font_assets()],
});
