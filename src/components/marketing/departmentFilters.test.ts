import { expect, test } from "vitest";
import {
  filterCreativeDepartmentItems,
  isCopyDepartmentItem,
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

test("items tagged with another department stay out of creative and copy", () => {
  for (const department of ["copy", "seo", "social", "web"])
    expect(
      isCreativeDepartmentItem({
        payload: { department, variations: [{ id: "v1" }] },
      }),
      department,
    ).toBe(false);
  for (const department of ["creative", "seo", "campaigns", "social", "web"])
    expect(
      isCopyDepartmentItem({ payload: { department, copy_text: "x" } }),
      department,
    ).toBe(false);
  expect(isCopyDepartmentItem({ payload: { department: "copy" } })).toBe(true);
});

test("a creative handed off to campaigns stays in creative", () => {
  expect(
    isCreativeDepartmentItem({
      payload: {
        department: "campaigns",
        creative_approved: true,
        variations: [{ id: "v1" }],
      },
    }),
  ).toBe(true);
  expect(
    isCreativeDepartmentItem({ payload: { department: "campaigns" } }),
  ).toBe(false);
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

test("a static project is in creative before it has a picture, and never in copy", () => {
  // The workshop groups it under Creative (has_creative) whatever brief or copy stage it has,
  // as the Creative screen's own new projects start: a brief, a format, no picture yet.
  for (const item of [
    { payload: { project_type: "static", brief_text: "בריף" } },
    { payload: { project_type: "static" }, current_stage_id: "copy-1" },
  ]) {
    expect(isCreativeDepartmentItem(item)).toBe(true);
    expect(isCopyDepartmentItem(item, "copy-1")).toBe(false);
  }
});

test("social and web work never shows in creative, as the workshop groups it", () => {
  // An untagged item in a social_organic pipeline is social work, even at that pipeline's
  // creative stage or with a picture; a tag for creative still wins, as in projectDepartment.
  const items = [
    { id: "post", pipeline_id: "social", payload: { image_url: "a.png" } },
    { id: "staged", pipeline_id: "social", current_stage_id: "creative-s" },
    {
      id: "variations",
      pipeline_id: "social",
      payload: { variations: [{ id: "v1" }] },
    },
    {
      id: "tagged",
      pipeline_id: "social",
      payload: { department: "creative", image_url: "b.png" },
    },
    { id: "web", payload: { department: "web", image_url: "c.png" } },
    { id: "ad", pipeline_id: "campaigns", payload: { image_url: "d.png" } },
  ];
  expect(
    filterCreativeDepartmentItems(items, ["creative-s"], ["social"]).map(
      (item) => item.id,
    ),
  ).toStrictEqual(["tagged", "ad"]);
});
