import assert from "node:assert/strict";
import { test } from "node:test";
import {
  artifactText,
  foldersOf,
  pagesIn,
  pageTypeFor,
  shouldFollow,
  storagePathsIn,
  withSignedUrls,
  type WorkshopArtifact,
} from "./workshopFeed.ts";

const page = (over: Partial<WorkshopArtifact>): WorkshopArtifact => ({
  id: "a",
  item_id: "i",
  kind: "image",
  folder: "images",
  title: "",
  status: "ready",
  url: null,
  thumb_url: null,
  meta: {},
  created_at: "2026-10-24T10:00:00Z",
  ...over,
});

test("each kind of artifact gets the right kind of page", () => {
  assert.equal(pageTypeFor(page({ kind: "brief" })), "brief");
  assert.equal(pageTypeFor(page({ kind: "scene_still" })), "image");
  assert.equal(pageTypeFor(page({ kind: "film" })), "video");
  assert.equal(pageTypeFor(page({ kind: "music" })), "audio");
  assert.equal(pageTypeFor(page({ kind: "copy" })), "text");
  assert.equal(
    pageTypeFor(page({ kind: "reference", url: "https://x/ref.mp4?t=1" })),
    "video",
  );
  assert.equal(
    pageTypeFor(page({ kind: "reference", url: "https://x/ref.png" })),
    "image",
  );
});

test("the feed keeps arrival order and a folder shows only its own pages", () => {
  const items = [
    page({ id: "late", created_at: "2026-10-24T10:05:00Z", folder: "copy" }),
    page({ id: "early", created_at: "2026-10-24T10:01:00Z" }),
    page({ id: "mid", created_at: "2026-10-24T10:03:00Z" }),
  ];
  assert.deepEqual(pagesIn(items, null).map((p) => p.id), ["early", "mid", "late"]);
  assert.deepEqual(pagesIn(items, "images").map((p) => p.id), ["early", "mid"]);
  assert.deepEqual(
    foldersOf(items).map((f) => [f.folder, f.count]),
    [
      ["copy", 1],
      ["images", 2],
    ],
  );
});

test("page text comes from the first filled field", () => {
  assert.equal(artifactText(page({ meta: { text: "  שלום  " } })), "שלום");
  assert.equal(artifactText(page({ meta: { brief: "בריף" } })), "בריף");
  assert.equal(artifactText(page({ meta: {} })), "");
});

test("the board follows new pages only while following", () => {
  assert.equal(shouldFollow(1, 2, true), true);
  assert.equal(shouldFollow(1, 2, false), false);
  assert.equal(shouldFollow(2, 2, true), false);
});

test("private bucket paths are signed and web links are left alone", () => {
  const items = [
    page({ id: "a", url: "https://x/a.png", thumb_url: "https://x/a.png" }),
    page({ id: "b", url: "tenant/item/clip.mp4", thumb_url: null }),
    page({ id: "c", url: "tenant/item/clip.mp4", thumb_url: "tenant/item/t.jpg" }),
  ];
  assert.deepEqual(storagePathsIn(items), ["tenant/item/clip.mp4", "tenant/item/t.jpg"]);
  const out = withSignedUrls(items, { "tenant/item/clip.mp4": "https://signed/clip" });
  assert.equal(out[0].url, "https://x/a.png");
  assert.equal(out[1].url, "https://signed/clip");
  assert.equal(out[2].thumb_url, null);
});
