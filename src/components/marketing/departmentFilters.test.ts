import { expect, test } from "vitest";
import {
  filterCreativeDepartmentItems,
  isCreativeDepartmentItem,
} from "./departmentFilters.ts";

test("creative items stay visible even without a loaded stage id", () => {
  expect(
    isCreativeDepartmentItem({ payload: { department: "creative" } }),
  ).toBe(true);
  expect(isCreativeDepartmentItem({ payload: { handoff_from: "copy" } })).toBe(
    true,
  );
  expect(
    isCreativeDepartmentItem({ payload: { variations: [{ id: "v1" }] } }),
  ).toBe(true);
  expect(isCreativeDepartmentItem({ payload: { department: "copy" } })).toBe(
    false,
  );
});

test("filterCreativeDepartmentItems matches a tenant creative stage", () => {
  const items = [
    { id: "copy", payload: { department: "copy" }, current_stage_id: "copy-1" },
    { id: "legacy", payload: {}, current_stage_id: "creative-9" },
    {
      id: "tagged",
      payload: { department: "creative" },
      current_stage_id: "other",
    },
  ];
  expect(
    filterCreativeDepartmentItems(items, ["creative-9"]).map((item) => item.id),
  ).toStrictEqual(["legacy", "tagged"]);
});

test("video projects stay in creative without a payload storyboard", () => {
  expect(isCreativeDepartmentItem({ payload: { project_type: "video" } })).toBe(
    true,
  );
  expect(
    isCreativeDepartmentItem({
      payload: { project_type: "video", storyboard: [] },
    }),
  ).toBe(true);
  expect(
    isCreativeDepartmentItem({
      payload: { project_type: "video", department: "copy" },
    }),
  ).toBe(false);
});
