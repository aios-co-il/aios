import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetStoragePath,
  canBeReference,
  groupAssets,
  normalizeLink,
  referenceCount,
  type WorkshopAsset,
} from "./workshopAssets.ts";

const asset = (over: Partial<WorkshopAsset>): WorkshopAsset => ({
  id: "a",
  asset_type: "image",
  source: "user",
  title: "x",
  url: "https://f/x.png",
  storage_path: null,
  text: null,
  use_as_reference: false,
  meta: {},
  created_at: "2026-10-24T10:00:00Z",
  ...over,
});

test("assets group into fixed sections with the client's first", () => {
  const sections = groupAssets([
    asset({ id: "1", asset_type: "text", created_at: "2026-10-24T09:00:00Z" }),
    asset({ id: "2" }),
    asset({ id: "3", source: "client", asset_type: "site" }),
    asset({ id: "4", asset_type: "site", source: "carmen" }),
    asset({ id: "5", asset_type: "file" }),
  ]);
  assert.deepEqual(
    sections.map((s) => [s.key, s.items.map((i) => i.id)]),
    [
      ["client", ["3"]],
      ["image", ["2"]],
      ["link", ["4"]],
      ["text", ["1"]],
      ["file", ["5"]],
    ],
  );
  assert.deepEqual(groupAssets([]), []);
});

test("only https pictures can be references, and they are counted", () => {
  assert.equal(canBeReference(asset({})), true);
  assert.equal(canBeReference(asset({ url: "http://f/x.png" })), false);
  assert.equal(canBeReference(asset({ asset_type: "file" })), false);
  assert.equal(
    referenceCount([
      asset({ use_as_reference: true }),
      asset({ use_as_reference: true, asset_type: "file" }),
      asset({}),
    ]),
    1,
  );
});

test("upload paths are ASCII and keep the extension", () => {
  assert.equal(
    assetStoragePath("t", "i", "לוגו חדש.PNG", 5),
    "t/workshop/i/5__.png",
  );
  assert.equal(
    assetStoragePath("t", "i", "my logo.JPG", 7),
    "t/workshop/i/7_my_logo.jpg",
  );
});

test("a typed link gets https and junk is refused", () => {
  assert.equal(
    normalizeLink("garden.example.com"),
    "https://garden.example.com/",
  );
  assert.equal(normalizeLink(" https://a.co/x "), "https://a.co/x");
  assert.equal(normalizeLink("not a link"), null);
  assert.equal(normalizeLink("localhost"), null);
  assert.equal(normalizeLink(""), null);
});
