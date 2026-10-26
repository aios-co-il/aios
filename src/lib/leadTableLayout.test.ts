import { expect, test } from "vitest";
import {
  groupLeadsBySurfaceUsers,
  isSalesPersonOnSurface,
  parseLeadTableLayout,
  sortLeadsByDate,
  UNASSIGNED_LEAD_GROUP_ID,
} from "./leadTableLayout.ts";

const dana = {
  id: "dana",
  full_name: "דנה",
  agency_id: "agency-a",
  agencyIds: ["agency-a"],
};
const noam = {
  id: "noam",
  full_name: "נועם",
  agency_id: "agency-b",
  agencyIds: ["agency-b", "agency-a"],
};
const otherAgency = {
  id: "other",
  full_name: "מיכל",
  agency_id: "agency-c",
  agencyIds: ["agency-c"],
};

test("parseLeadTableLayout defaults to by_date", () => {
  expect(parseLeadTableLayout(null)).toBe("by_date");
  expect(parseLeadTableLayout("kanban")).toBe("by_date");
  expect(parseLeadTableLayout("by_user")).toBe("by_user");
  expect(parseLeadTableLayout("by_date")).toBe("by_date");
});

test("isSalesPersonOnSurface keeps everyone when agency is all", () => {
  expect(isSalesPersonOnSurface(dana, "all")).toBe(true);
  expect(isSalesPersonOnSurface(otherAgency, null)).toBe(true);
});

test("isSalesPersonOnSurface uses primary agency or extra memberships", () => {
  expect(isSalesPersonOnSurface(dana, "agency-a")).toBe(true);
  expect(isSalesPersonOnSurface(noam, "agency-a")).toBe(true);
  expect(isSalesPersonOnSurface(otherAgency, "agency-a")).toBe(false);
});

test("sortLeadsByDate newest first", () => {
  const sorted = sortLeadsByDate([
    { id: "old", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "new", created_at: "2026-09-01T00:00:00.000Z" },
    { id: "mid", created_at: "2026-06-01T00:00:00.000Z" },
  ]);
  expect(sorted.map((lead) => lead.id)).toStrictEqual(["new", "mid", "old"]);
});

test("groupLeadsBySurfaceUsers lists surface users even when empty", () => {
  const groups = groupLeadsBySurfaceUsers(
    [
      {
        id: "l1",
        sales_person_id: "dana",
        created_at: "2026-09-02T00:00:00.000Z",
      },
    ],
    [dana, noam, otherAgency],
    "agency-a",
  );

  expect(groups.map((group) => group.id)).toStrictEqual(["dana", "noam"]);
  expect(groups[0].leads[0].id).toBe("l1");
  expect(groups[1].leads.length).toBe(0);
});

test("groupLeadsBySurfaceUsers keeps off-surface assignees and sorts dates", () => {
  const groups = groupLeadsBySurfaceUsers(
    [
      {
        id: "older",
        sales_person_id: "other",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "newer",
        sales_person_id: "other",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "free",
        sales_person_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
      },
    ],
    [dana, otherAgency],
    "agency-a",
  );

  expect(
    groups.map((group) => [group.id, group.leads.map((lead) => lead.id)]),
  ).toStrictEqual([
    ["dana", []],
    ["other", ["newer", "older"]],
    [UNASSIGNED_LEAD_GROUP_ID, ["free"]],
  ]);
  expect(groups[1].label).toBe("מיכל");
});
