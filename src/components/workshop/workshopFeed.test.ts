import { expect, test } from "vitest";
import {
  artifactText,
  fallbackNote,
  foldersOf,
  pagesIn,
  pageTypeFor,
  projectFormat,
  shouldFollow,
  splitFailures,
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
  expect(pageTypeFor(page({ kind: "brief" }))).toBe("brief");
  expect(pageTypeFor(page({ kind: "scene_still" }))).toBe("image");
  expect(pageTypeFor(page({ kind: "film" }))).toBe("video");
  expect(pageTypeFor(page({ kind: "music" }))).toBe("audio");
  expect(pageTypeFor(page({ kind: "copy" }))).toBe("text");
  expect(
    pageTypeFor(page({ kind: "reference", url: "https://x/ref.mp4?t=1" })),
  ).toBe("video");
  expect(
    pageTypeFor(page({ kind: "reference", url: "https://x/ref.png" })),
  ).toBe("image");
});

test("the feed keeps arrival order and a folder shows only its own pages", () => {
  const items = [
    page({ id: "late", created_at: "2026-10-24T10:05:00Z", folder: "copy" }),
    page({ id: "early", created_at: "2026-10-24T10:01:00Z" }),
    page({ id: "mid", created_at: "2026-10-24T10:03:00Z" }),
  ];
  expect(pagesIn(items, null).map((p) => p.id)).toStrictEqual([
    "early",
    "mid",
    "late",
  ]);
  expect(pagesIn(items, "images").map((p) => p.id)).toStrictEqual([
    "early",
    "mid",
  ]);
  expect(foldersOf(items).map((f) => [f.folder, f.count])).toStrictEqual([
    ["copy", 1],
    ["images", 2],
  ]);
});

test("page text comes from the first filled field", () => {
  expect(artifactText(page({ meta: { text: "  שלום  " } }))).toBe("שלום");
  expect(artifactText(page({ meta: { brief: "בריף" } }))).toBe("בריף");
  expect(artifactText(page({ meta: {} }))).toBe("");
});

test("the board follows new pages only while following", () => {
  expect(shouldFollow(1, 2, true)).toBe(true);
  expect(shouldFollow(1, 2, false)).toBe(false);
  expect(shouldFollow(2, 2, true)).toBe(false);
});

test("private bucket paths are signed and web links are left alone", () => {
  const items = [
    page({ id: "a", url: "https://x/a.png", thumb_url: "https://x/a.png" }),
    page({ id: "b", url: "tenant/item/clip.mp4", thumb_url: null }),
    page({
      id: "c",
      url: "tenant/item/clip.mp4",
      thumb_url: "tenant/item/t.jpg",
    }),
  ];
  expect(storagePathsIn(items)).toStrictEqual([
    "tenant/item/clip.mp4",
    "tenant/item/t.jpg",
  ]);
  const out = withSignedUrls(items, {
    "tenant/item/clip.mp4": "https://signed/clip",
  });
  expect(out[0].url).toBe("https://x/a.png");
  expect(out[1].url).toBe("https://signed/clip");
  expect(out[2].thumb_url).toBe(null);
});

test("a project's format comes from its brief, with a default", () => {
  const brief = page({ kind: "brief", meta: { plan: { format: "9:16" } } });
  expect(projectFormat([brief])).toBe("9:16");
  expect(projectFormat([])).toBe("4:5");
});

test("failed pages leave the board and only recent errors are spoken", () => {
  const now = Date.parse("2026-10-24T10:10:00Z");
  const result = splitFailures(
    [
      page({ id: "ok", status: "ready" }),
      page({ id: "new", status: "failed", meta: { text: "OpenAI: 400" } }),
      page({ id: "dup", status: "failed", meta: { text: "OpenAI: 400" } }),
      page({
        id: "old",
        status: "failed",
        created_at: "2026-10-23T10:00:00Z",
        meta: { text: "ישן" },
      }),
    ],
    now,
  );
  expect(result.kept.map((row) => row.id)).toStrictEqual(["ok"]);
  expect(result.failedIds).toStrictEqual(["new", "dup", "old"]);
  expect(result.messages).toStrictEqual(["OpenAI: 400"]);
});

test("a clip made on a replacement engine says so; a normal clip says nothing", () => {
  expect(
    fallbackNote(
      page({
        kind: "clip",
        meta: { provider: "mock", fallback_from: "elevenlabs" },
      }),
    ),
  ).toBe("הונפש במנוע התצוגה החינמי במקום ElevenLabs");
  expect(
    fallbackNote(page({ kind: "clip", meta: { provider: "higgsfield" } })),
  ).toBe(null);
});
