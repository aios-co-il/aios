import { expect, test } from "vitest";
import {
  defaultProject,
  departmentPath,
  groupByDepartment,
  groupProjects,
  statusLabel,
  type WorkshopListRow,
} from "./workshopProjectList.ts";

const row = (over: Partial<WorkshopListRow>): WorkshopListRow => ({
  id: "x",
  title: null,
  status: "draft",
  client_id: null,
  client_name: null,
  department_hint: null,
  has_board: false,
  project_type: null,
  target_channel: null,
  track: null,
  stage_type: null,
  has_copy: false,
  has_creative: false,
  has_seo_plan: false,
  updated_at: "2026-10-26T10:00:00Z",
  format: null,
  workshop_edit: false,
  ...over,
});

test("statuses read in Hebrew", () => {
  expect(statusLabel("draft")).toBe("טיוטה");
  expect(statusLabel("in_progress")).toBe("בעבודה");
  expect(statusLabel("waiting_approval")).toBe("ממתין לאישור");
  expect(statusLabel("approved")).toBe("מאושר");
  expect(statusLabel("published")).toBe("פורסם");
  expect(statusLabel("failed")).toBe("נכשל");
});

test("departments come in registry order with their items", () => {
  const groups = groupByDepartment([
    row({ id: "s", track: "seo_geo" }),
    row({ id: "c", has_copy: true }),
    row({ id: "b", has_board: true }),
    row({ id: "w", department_hint: "web" }),
    row({ id: "c2", stage_type: "copy" }),
  ]);
  expect(groups.map((g) => [g.department, g.items.map((i) => i.id)])).toEqual([
    ["creative", ["b"]],
    ["copy", ["c", "c2"]],
    ["seo", ["s"]],
    ["web", ["w"]],
  ]);
  expect(groups[1].label).toBe("קופי");
});

test("one client in view groups by department only", () => {
  const groups = groupProjects(
    [row({ id: "a", client_id: "c1", has_board: true })],
    false,
  );
  expect(groups.length).toBe(1);
  expect(groups[0].count).toBe(1);
  expect(groups[0].departments[0].department).toBe("creative");
  expect(groupProjects([], false)).toEqual([]);
});

test("every client in view groups by client, unassigned last", () => {
  const groups = groupProjects(
    [
      row({ id: "u1" }),
      row({ id: "b1", client_id: "cb", client_name: "Beta" }),
      row({ id: "a1", client_id: "ca", client_name: "Alpha", has_copy: true }),
      row({ id: "b2", client_id: "cb", client_name: "Beta", has_board: true }),
    ],
    true,
  );
  expect(groups.map((g) => [g.clientId, g.name, g.count])).toEqual([
    ["cb", "Beta", 2],
    ["ca", "Alpha", 1],
    [null, "ללא לקוח", 1],
  ]);
  expect(groups[0].departments.map((d) => d.department)).toEqual(["creative"]);
  expect(groups[1].departments[0].department).toBe("copy");
});

test("with no project in the URL the latest board opens", () => {
  expect(
    defaultProject([
      row({ id: "copy", has_copy: true }),
      row({ id: "board", has_board: true }),
    ])?.id,
  ).toBe("board");
  expect(defaultProject([row({ id: "copy" })])).toBe(null);
});

test("a department screen opens on the project's client, or on general content", () => {
  expect(departmentPath("copy", "c-1")).toBe(
    "marketing/department/copy?client=c-1",
  );
  expect(departmentPath("seo", null)).toBe(
    "marketing/department/seo?client=general",
  );
});
