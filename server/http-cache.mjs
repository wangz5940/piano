import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createBrotliCompress, createGzip, constants } from "node:zlib";
import { pipeline, Readable } from "node:stream";

// A weak validator remains valid across identity, gzip and Brotli representations.
export function body_etag(body) {
  return `W/"${createHash("sha256").update(body).digest("base64url")}"`;
}

export function is_not_modified(request, etag) {
  return (request.headers["if-none-match"] ?? "")
    .split(",")
    .some((value) => {
      const candidate = value.trim();
      return candidate === "*" || candidate.replace(/^W\//, "") === etag.replace(/^W\//, "");
    });
}

export function accepted_encoding(request) {
  const preferences = new Map(
    (request.headers["accept-encoding"] ?? "").toLowerCase().split(",").map((part) => {
      const [name, ...parameters] = part.trim().split(";");
      const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const weight = quality ? Number(quality.trim().slice(2)) : 1;
      return [name, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0];
    }),
  );
  const weight = (name) => preferences.get(name) ?? preferences.get("*") ?? 0;
  const encoding = weight("br") >= weight("gzip") ? "br" : "gzip";
  return weight(encoding) > 0 &&
    weight(encoding) >= (preferences.get("identity") ?? 0) ? encoding : undefined;
}

const asset_digests = new Map();

export function compressed_asset_path(file_path, metadata, encoding) {
  const version = `${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`;
  let entry = asset_digests.get(file_path);
  if (entry?.version !== version) {
    entry = {
      version,
      digest: createHash("sha256").update(readFileSync(file_path)).digest("hex"),
    };
    asset_digests.delete(file_path);
    if (asset_digests.size >= 64) asset_digests.delete(asset_digests.keys().next().value);
    asset_digests.set(file_path, entry);
  }
  return `${file_path}.${entry.digest}.${encoding === "br" ? "br" : "gz"}`;
}

export function send_stream(request, response, stream, size, compressible) {
  if (compressible) {
    response.setHeader("Vary", "Accept-Encoding");
  }
  const encoding = compressible && size >= 1024 ? accepted_encoding(request) : undefined;
  if (encoding) {
    response.setHeader("Content-Encoding", encoding);
  } else {
    response.setHeader("Content-Length", size);
  }
  if (request.method === "HEAD") {
    stream.destroy();
    response.end();
    return;
  }
  const stages = [stream];
  if (encoding === "br") {
    stages.push(createBrotliCompress({
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    }));
  } else if (encoding === "gzip") {
    stages.push(createGzip({ level: 6 }));
  }
  // pipeline closes all streams when a client disconnects or a read fails.
  pipeline(...stages, response, () => {});
}

export function send_public_json(request, response, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  const etag = body_etag(bytes);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  // Revalidate on reuse so publishing, calibration and deletion take effect immediately.
  response.setHeader("Cache-Control", "public, no-cache");
  response.setHeader("ETag", etag);
  response.setHeader("Vary", "Accept-Encoding");
  if (is_not_modified(request, etag)) {
    response.statusCode = 304;
    response.end();
    return;
  }
  response.statusCode = 200;
  send_stream(request, response, Readable.from([bytes]), bytes.length, true);
}
