import assert from "node:assert/strict";
import { test } from "node:test";
import { changelogHighlights, renderDownloadPage } from "../scripts/lib/download-page.mjs";
import { ARTIFACT_RE, stableName } from "../scripts/lib/release-index.mjs";

test("artifact names map to latest aliases", () => {
  const name = "FreeAll-0.2.0-mac-arm64.dmg";
  assert.match(name, ARTIFACT_RE);
  assert.equal(stableName(name), "FreeAll-latest-mac-arm64.dmg");
});

test("download page uses FreeAll copy and current version", () => {
  const html = renderDownloadPage({
    version: "0.2.0",
    publishedAt: "2026-09-17T00:00:00.000Z",
    assets: [{ name: "FreeAll-0.2.0-mac-arm64.dmg", url: "https://example/FreeAll-0.2.0-mac-arm64.dmg", size: 80_000_000 }],
    highlights: ["菜单栏打开"],
    manifestUrl: "https://example/latest.json",
    stableUrl: () => "https://example/FreeAll-latest-mac-arm64.dmg",
  });
  assert.match(html, /FreeAll/);
  assert.match(html, /0\.2\.0/);
  assert.match(html, /打开 FreeAll/);
  assert.equal(html.includes("台账"), false);
  assert.match(html, /FreeAll-latest-mac-arm64\.dmg/);
});

test("changelog highlights read the matching version block", () => {
  const md = `## 0.2.0 — 2026-09-17\n\n- 菜单栏软件\n- 发布页\n\n## 0.1.0 — 2026-09-02\n\n- 旧项\n`;
  assert.deepEqual(changelogHighlights(md, "0.2.0"), ["菜单栏软件", "发布页"]);
});
