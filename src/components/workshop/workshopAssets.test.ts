import { expect, test } from "vitest";
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
  expect(sections.map((s) => [s.key, s.items.map((i) => i.id)])).toStrictEqual([
    ["client", ["3"]],
    ["image", ["2"]],
    ["link", ["4"]],
    ["text", ["1"]],
    ["file", ["5"]],
  ]);
  expect(groupAssets([])).toStrictEqual([]);
});

test("only https pictures can be references, and they are counted", () => {
  expect(canBeReference(asset({}))).toBe(true);
  expect(canBeReference(asset({ url: "http://f/x.png" }))).toBe(false);
  expect(canBeReference(asset({ asset_type: "file" }))).toBe(false);
  expect(
    referenceCount([
      asset({ use_as_reference: true }),
      asset({ use_as_reference: true, asset_type: "file" }),
      asset({}),
    ]),
  ).toBe(1);
});

test("upload paths are ASCII and keep the extension", () => {
  expect(assetStoragePath("t", "i", "לוגו חדש.PNG", 5)).toBe(
    "t/workshop/i/5__.png",
  );
  expect(assetStoragePath("t", "i", "my logo.JPG", 7)).toBe(
    "t/workshop/i/7_my_logo.jpg",
  );
});

test("a typed link gets https and junk is refused", () => {
  expect(normalizeLink("garden.example.com")).toBe(
    "https://garden.example.com/",
  );
  expect(normalizeLink(" https://a.co/x ")).toBe("https://a.co/x");
  expect(normalizeLink("not a link")).toBe(null);
  expect(normalizeLink("localhost")).toBe(null);
  expect(normalizeLink("")).toBe(null);
});
