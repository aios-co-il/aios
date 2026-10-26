import { expect, test } from "vitest";
import { tabIdForRoute } from "./menuStructure.ts";

test("recordings route maps to marketing sidebar tab", () => {
  expect(tabIdForRoute("/recordings")).toBe("marketing");
});

test("clients route maps to daily sidebar tab", () => {
  expect(tabIdForRoute("/clients")).toBe("daily");
});
