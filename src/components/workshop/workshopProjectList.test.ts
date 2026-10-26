import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultProject,
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
  ...over,
});

test("statuses read in Hebrew", () => {
  assert.equal(statusLabel("draft"), "טיוטה");
  assert.equal(statusLabel("in_progress"), "בעבודה");
  assert.equal(statusLabel("waiting_approval"), "ממתין לאישור");
  assert.equal(statusLabel("approved"), "מאושר");
  assert.equal(statusLabel("published"), "פורסם");
  assert.equal(statusLabel("failed"), "נכשל");
});

test("departments come in registry order with their items", () => {
  const groups = groupByDepartment([
    row({ id: "s", track: "seo_geo" }),
    row({ id: "c", has_copy: true }),
    row({ id: "b", has_board: true }),
    row({ id: "w", department_hint: "web" }),
    row({ id: "c2", stage_type: "copy" }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.department, g.items.map((i) => i.id)]),
    [
      ["creative", ["b"]],
      ["copy", ["c", "c2"]],
      ["seo", ["s"]],
      ["web", ["w"]],
    ],
  );
  assert.equal(groups[1].label, "קופי");
});

test("one client in view groups by department only", () => {
  const groups = groupProjects(
    [row({ id: "a", client_id: "c1", has_board: true })],
    false,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
  assert.equal(groups[0].departments[0].department, "creative");
  assert.deepEqual(groupProjects([], false), []);
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
  assert.deepEqual(
    groups.map((g) => [g.clientId, g.name, g.count]),
    [
      ["cb", "Beta", 2],
      ["ca", "Alpha", 1],
      [null, "ללא לקוח", 1],
    ],
  );
  assert.deepEqual(
    groups[0].departments.map((d) => d.department),
    ["creative"],
  );
  assert.equal(groups[1].departments[0].department, "copy");
});

test("with no project in the URL the latest board opens", () => {
  assert.equal(
    defaultProject([
      row({ id: "copy", has_copy: true }),
      row({ id: "board", has_board: true }),
    ])?.id,
    "board",
  );
  assert.equal(defaultProject([row({ id: "copy" })]), null);
});
