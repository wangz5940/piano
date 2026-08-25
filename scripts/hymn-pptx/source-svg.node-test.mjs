import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";

import { scan_hymn_pptx } from "./scanner.mjs";
import {
  build_source_document_artifacts,
  create_pptx_source_document,
} from "./source-document.mjs";
import {
  convert_source_layout_to_svg,
  source_svg_review_scope,
  write_source_svg_artifacts,
} from "./source-svg.mjs";
import {
  hymn_pptx_input_root,
  project_root,
} from "./test-fixtures.mjs";

const fixtures = Object.freeze([
  Object.freeze({
    hymn_id: "001",
    slide_count: 7,
    shape_count: 35,
    source_color: "#0432FF",
  }),
  Object.freeze({
    hymn_id: "002",
    slide_count: 5,
    shape_count: 30,
    source_color: "#0432FF",
  }),
  Object.freeze({
    hymn_id: "371",
    slide_count: 3,
    shape_count: 15,
    source_color: "#000000",
  }),
]);
const svg_hash_snapshots = Object.freeze({
  "001": Object.freeze([
    "09fda881cab49a8096a377750927b9ed0223e0c38ad237727a0c388492aaf4be",
    "e44e5ee331af19fec41b018ec2aeccf06ac3ba9eb6b48648da79eba83972e09e",
    "dd69c6cadd708a14eb3482385104a4aa109429f8153346d06b230db22fdb1cab",
    "bdf84390e1fb8b6cc5fd0dbd1d0d6a1ffdeec931116d652f0d50b9443065e1d3",
    "c7d9ba6746e6efde98c192d993b8004df0525d3927e1758347720b0bb1df5664",
    "99964c80927727d197df1c428abc20e3781bfc07764013cabce6a8abe307d5ea",
    "6d1e015113c6e1733eba9198b2347a2f63bfc6052bbef18666e86f7e31b00040",
  ]),
  "002": Object.freeze([
    "bd7a6edd3fc6ec7310f0c578c301e23620a2f40e74a429aad3efae0fc934480a",
    "27d0edc0ff00712005dfc9f4dbdc4e3e151c5e325a26dc1f09c944bf517f47f5",
    "9036224432c40def5f878295b470c5ebce8387e09bd2afb8e134ff6d0291ab10",
    "fcc0633f284fa0973f1b73d825b14270104dfe9008890e621d30642b628fbd5e",
    "e4a27f526142eb757b3fb1183af0e86c462dc566ca51bdc0b4fc7ccf312e38b0",
  ]),
  "371": Object.freeze([
    "c94fccc3dfa6492ea5a43f43bc3e1967ef358d73f196d0a183b4abbb5b8c9878",
    "dc6d065fa13e1de1885c8cb58600308baf806530e21ffd4aafc8aa0e4583a5b9",
    "07caf340c29b86f6f61be8c6803b495e00231dc345ff6ac9c620be0d43f02599",
  ]),
});

let layouts;
let svg_artifacts;

before(async () => {
  const scan = await scan_hymn_pptx({
    input_root: hymn_pptx_input_root,
    project_root,
  });
  const files_by_id = new Map(
    scan.files.map((source_file) => [
      source_file.hymn_id,
      source_file,
    ]),
  );
  layouts = new Map(
    await Promise.all(fixtures.map(async (fixture) => {
      const source_file = files_by_id.get(fixture.hymn_id);
      assert.ok(source_file, `缺少固定样本 ${fixture.hymn_id}`);
      const source_document =
        await create_pptx_source_document(source_file);
      return [
        fixture.hymn_id,
        build_source_document_artifacts(source_document).source_layout,
      ];
    })),
  );
  svg_artifacts = new Map(fixtures.map((fixture) => [
    fixture.hymn_id,
    convert_source_layout_to_svg(layouts.get(fixture.hymn_id)),
  ]));
});

test("001、002、371 来源 SVG 快照保持稳定", () => {
  for (const fixture of fixtures) {
    assert.deepEqual(
      svg_artifacts.get(fixture.hymn_id).slides.map((page) =>
        createHash("sha256").update(page.svg, "utf8").digest("hex")),
      svg_hash_snapshots[fixture.hymn_id],
    );
  }
});

test("001、002、371 按来源分页保留 EMU viewBox、16:9 和 shape 数量", () => {
  for (const fixture of fixtures) {
    const pages = svg_artifacts.get(fixture.hymn_id).slides;
    assert.equal(pages.length, fixture.slide_count);
    assert.equal(
      pages.reduce(
        (count, page) =>
          count + count_attribute(page.svg, "data-node-kind", "shape"),
        0,
      ),
      fixture.shape_count,
    );

    for (const page of pages) {
      assert.deepEqual(page.canvas, {
        cx: 9144000,
        cy: 5143500,
        type: "screen16x9",
      });
      assert.equal(page.width, 960);
      assert.equal(page.height, 540);
      assert.equal(page.aspect_ratio, "16:9");
      assert.match(
        page.svg,
        /viewBox="0 0 9144000 5143500"/u,
      );
      assert.match(page.svg, /\swidth="960"/u);
      assert.match(page.svg, /\sheight="540"/u);
      assert.match(page.svg, /preserveAspectRatio="xMidYMid meet"/u);
    }
  }
});

test("Base 与 Accent 是独立来源层且 Accent 未拼入 Base 文本", () => {
  for (const fixture of fixtures) {
    for (const page of svg_artifacts.get(fixture.hymn_id).slides) {
      assert.equal(
        count_attribute(page.svg, "data-layer", "score-base"),
        1,
      );
      assert.equal(
        count_attribute(page.svg, "data-layer", "score-accent"),
        1,
      );
    }
  }

  const accent_pages = svg_artifacts.get("002").slides;
  assert.equal(
    accent_pages.reduce(
      (count, page) =>
        count +
        count_attribute(
          page.svg,
          "data-run-classification",
          "score_accent",
        ),
      0,
    ),
    5,
  );
  assert.equal(
    accent_pages.reduce(
      (count, page) =>
        count +
        count_attribute(
          extract_layer(page.svg, "score-base"),
          "data-run-classification",
          "score_accent",
        ),
      0,
    ),
    0,
  );
});

test("来源 SVG 保留歌词颜色和默认文字颜色", () => {
  for (const fixture of fixtures) {
    assert.ok(
      svg_artifacts.get(fixture.hymn_id).slides.some((page) =>
        page.svg.includes(`fill="${fixture.source_color}"`)),
      `${fixture.hymn_id} 缺少来源颜色 ${fixture.source_color}`,
    );
  }
});

test("shape 与 run 节点包含幻灯片、shape 和 run 来源标识", () => {
  const first_page = svg_artifacts.get("001").slides[0];
  assert.match(
    first_page.svg,
    /data-node-kind="shape"[^>]*data-source-slide-id="303"[^>]*data-source-shape-id="14"/u,
  );
  assert.match(
    first_page.svg,
    /data-node-kind="run"[^>]*data-source-slide-id="303"[^>]*data-source-shape-id="14"[^>]*data-source-run-id="303:14:1:1"/u,
  );

  for (const fixture of fixtures) {
    for (const page of svg_artifacts.get(fixture.hymn_id).slides) {
      const run_count = count_attribute(
        page.svg,
        "data-node-kind",
        "run",
      );
      assert.ok(run_count > 0);
      assert.equal(
        count_attribute(page.svg, "data-source-run-id"),
        run_count,
      );
      assert.equal(
        count_attribute(page.svg, "data-source-slide-id"),
        run_count + page.shape_count + 1,
      );
    }
  }
});

test("来源 SVG 只引用受控字体族且拒绝写入公开目录", async () => {
  const artifacts = svg_artifacts.get("002");
  const first_svg = artifacts.slides[0].svg;

  assert.equal(artifacts.review_scope, source_svg_review_scope);
  assert.ok(
    artifacts.font_rights.every((font) =>
      font.rights_status !== "licensed"),
  );
  assert.match(first_svg, /data-font-access="controlled-review"/u);
  assert.match(first_svg, /font-family="SimpMusic Base"/u);
  assert.match(first_svg, /font-family="SimpMusic Accent"/u);
  assert.doesNotMatch(
    first_svg,
    /@font-face|data:font|url\(|\.ttf|\.woff/iu,
  );

  await assert.rejects(
    write_source_svg_artifacts(
      join(tmpdir(), "public", "panio-source-svg-test"),
      layouts.get("002"),
      { review_scope: source_svg_review_scope },
    ),
    (error) => error?.code === "SOURCE_SVG_PUBLIC_OUTPUT_FORBIDDEN",
  );
});

function count_attribute(source, attribute_name, value) {
  const value_pattern = value === undefined
    ? `(?:="[^"]*")?`
    : `="${escape_regexp(value)}"`;
  return (
    source.match(
      new RegExp(
        `${escape_regexp(attribute_name)}${value_pattern}`,
        "gu",
      ),
    ) ?? []
  ).length;
}

function extract_layer(svg, layer_name) {
  const marker = `data-layer="${layer_name}"`;
  const marker_index = svg.indexOf(marker);
  assert.notEqual(marker_index, -1, `缺少 ${layer_name} 层`);
  const start = svg.lastIndexOf("  <g ", marker_index);
  const next_layer = svg.indexOf("\n  <g id=\"source-layer-", marker_index);
  return svg.slice(
    start,
    next_layer === -1 ? svg.length : next_layer,
  );
}

function escape_regexp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
