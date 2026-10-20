import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareVersions,
  evaluateUpdate,
  normalizeVersion,
  parseUpdateManifest,
  pickReleaseAsset,
  shouldNotifyUpdate,
  shouldShowUpdateBanner,
} from "../src/update-check.js";

test("normalizeVersion strips v prefix", () => {
  assert.equal(normalizeVersion("v0.2.4"), "0.2.4");
  assert.equal(normalizeVersion(" 1.0.0 "), "1.0.0");
});

test("compareVersions is numeric by segment", () => {
  assert.equal(compareVersions("0.2.10", "0.2.9"), 1);
  assert.equal(compareVersions("0.2.9", "0.2.10"), -1);
  assert.equal(compareVersions("0.2.4", "0.2.4"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta"), 1);
});

test("parseUpdateManifest reads FreeAll latest.json shape", () => {
  const m = parseUpdateManifest({
    version: "0.2.5",
    releasesUrl: "https://example/index.html",
    assets: [{ name: "FreeAll-0.2.5-mac-arm64.dmg", url: "https://example/a.dmg", size: 1 }],
  });
  assert.ok(m);
  assert.equal(m!.version, "0.2.5");
  assert.equal(m!.assets[0]?.name, "FreeAll-0.2.5-mac-arm64.dmg");
});

test("pickReleaseAsset prefers arm64 dmg on darwin", () => {
  const asset = pickReleaseAsset(
    [
      { name: "FreeAll-0.2.5-mac-x64.dmg", url: "https://x" },
      { name: "FreeAll-0.2.5-mac-arm64.dmg", url: "https://arm" },
    ],
    "darwin",
    "arm64",
  );
  assert.equal(asset?.url, "https://arm");
});

test("evaluateUpdate reports update-available", () => {
  const r = evaluateUpdate({ current: "0.2.4", latest: "0.2.5", downloadUrl: "https://d" });
  assert.equal(r.status, "update-available");
  assert.match(r.message, /0\.2\.5/);
});

test("banner and notify respect dismiss/seen versions", () => {
  assert.equal(
    shouldShowUpdateBanner({ status: "update-available", latest: "0.2.5", dismissedVersion: "0.2.5" }),
    false,
  );
  assert.equal(
    shouldShowUpdateBanner({ status: "update-available", latest: "0.2.5", dismissedVersion: "0.2.4" }),
    true,
  );
  assert.equal(
    shouldNotifyUpdate({ status: "update-available", latest: "0.2.5", seenVersion: "0.2.5" }),
    false,
  );
  assert.equal(
    shouldNotifyUpdate({ status: "update-available", latest: "0.2.5", seenVersion: undefined }),
    true,
  );
});
