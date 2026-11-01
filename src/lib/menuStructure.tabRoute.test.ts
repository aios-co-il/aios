import { expect, test } from "vitest";
import { tabIdForRoute } from "./menuStructure.ts";

test("recordings route maps to marketing sidebar tab", () => {
  expect(tabIdForRoute("/recordings")).toBe("marketing");
});

test("workshop and the old marketing urls stay on the marketing tab", () => {
  expect(tabIdForRoute("/workshop")).toBe("marketing");
  expect(tabIdForRoute("/marketing/department/creative")).toBe("marketing");
});

test("clients route maps to daily sidebar tab", () => {
  expect(tabIdForRoute("/clients")).toBe("daily");
});
