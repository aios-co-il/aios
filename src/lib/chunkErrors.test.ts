import { expect, test } from "vitest";
import { isChunkLoadError } from "./chunkErrors.ts";

test("detects Vite dynamic import failures", () => {
  expect(
    isChunkLoadError(
      new Error(
        "Failed to fetch dynamically imported module: /assets/LeadIntegrations.js",
      ),
    ),
  ).toBe(true);
  expect(
    isChunkLoadError(new Error("ChunkLoadError: Loading chunk 12 failed")),
  ).toBe(true);
  expect(isChunkLoadError(new Error("something else"))).toBe(false);
});
