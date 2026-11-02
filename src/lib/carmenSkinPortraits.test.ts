import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "vitest";
import { getSkinPortrait, isBuiltInSkinPortrait } from "./carmenSkinPortraits";

test("the ten specialist personas resolve to shipped portraits", () => {
  const slugs = [
    "copywriter",
    "video_director",
    "creative_direct",
    "video_editor",
    "web_builder",
    "automator",
    "cfo",
    "campaigner",
    "seo",
    "analyst",
  ];
  const urls = slugs.map((slug) => getSkinPortrait(slug)!);
  assert.equal(new Set(urls).size, 10);
  for (const url of urls) {
    assert.ok(isBuiltInSkinPortrait(url));
    assert.ok(existsSync(`public${url}`), `Missing portrait: ${url}`);
  }
});

test("marketing manager and unrelated skills keep their original fallback", () => {
  for (const slug of [null, undefined, "marketing_manager", "legal", "unknown"])
    assert.equal(getSkinPortrait(slug), undefined);
  assert.equal(
    getSkinPortrait("tenant-editor", "עורכת וידאו"),
    getSkinPortrait("video_editor"),
  );
  assert.equal(isBuiltInSkinPortrait("https://example.com/custom.webp"), false);
});
