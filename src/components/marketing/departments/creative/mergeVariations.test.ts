import { expect, test } from "vitest";
import { mergeCreativeVariations } from "./mergeVariations.ts";
import type { CreativeVariation } from "./types.ts";

const variation = (
  overrides: Partial<CreativeVariation>,
): CreativeVariation => ({
  id: "a",
  name: "A",
  imageUrl: "https://img/a.png",
  format: "1:1",
  layers: [],
  comments: [],
  createdAt: "2026-08-26T00:00:00.000Z",
  ...overrides,
});

test("mergeCreativeVariations keeps a live reject when the incoming snapshot is stale", () => {
  const live = [variation({ rejected: true, rejectNote: "לא זה" })];
  const incoming = [variation({ name: "stale" })];
  const merged = mergeCreativeVariations(live, incoming);
  expect(merged[0].rejected).toBe(true);
  expect(merged[0].rejectNote).toBe("לא זה");
  expect(merged[0].name).toBe("stale");
});

test("mergeCreativeVariations keeps a variation Cursor completed that the local write did not know", () => {
  const live = [
    variation({ id: "a" }),
    variation({ id: "b", name: "from agent", imageUrl: "https://img/b.png" }),
  ];
  const incoming = [
    variation({ id: "a", rejected: true, rejectNote: "רג׳קט" }),
  ];
  const merged = mergeCreativeVariations(live, incoming);
  expect(merged.map((row) => row.id).join(",")).toBe("a,b");
  expect(merged[0].rejected).toBe(true);
  expect(merged[1].name).toBe("from agent");
});

test("mergeCreativeVariations can un-reject when the incoming write says so", () => {
  const live = [variation({ rejected: true })];
  const incoming = [
    variation({ rejected: false, imageUrl: "https://img/new.png" }),
  ];
  expect(mergeCreativeVariations(live, incoming)[0].rejected).toBe(false);
});

test("mergeCreativeVariations honors dropIds so a deleted still does not come back from live", () => {
  const live = [
    variation({ id: "keep", name: "Keep" }),
    variation({ id: "gone", name: "Gone", imageUrl: "https://img/gone.png" }),
  ];
  const incoming = [variation({ id: "keep", name: "Keep" })];
  const merged = mergeCreativeVariations(live, incoming, { dropIds: ["gone"] });
  expect(merged.map((row) => row.id).join(",")).toBe("keep");
});
