import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEPARTMENTS,
  departmentLabel,
  departmentScreen,
  isDepartmentId,
  projectDepartment,
} from "./departments.ts";

test("departments are listed in display order with Hebrew labels", () => {
  assert.deepEqual(
    DEPARTMENTS.map((dept) => dept.id),
    ["creative", "copy", "seo", "social", "web", "campaigns"],
  );
  assert.equal(departmentLabel("creative"), "קריאייטיב");
  assert.equal(departmentLabel("copy"), "קופי");
  assert.equal(departmentLabel("seo"), "SEO / GEO");
  assert.equal(departmentLabel("social"), "סושיאל");
  assert.equal(departmentLabel("web"), "בניית אתרים");
  assert.equal(departmentLabel("campaigns"), "קמפיינים");
});

test("only departments with a marketing screen link to one", () => {
  assert.equal(departmentScreen("creative"), "creative");
  assert.equal(departmentScreen("copy"), "copy");
  assert.equal(departmentScreen("seo"), "seo");
  assert.equal(departmentScreen("campaigns"), "campaigns");
  assert.equal(departmentScreen("social"), null);
  assert.equal(departmentScreen("web"), null);
  assert.equal(isDepartmentId("web"), true);
  assert.equal(isDepartmentId("analytics"), false);
  assert.equal(isDepartmentId(null), false);
});

test("a tagged department wins over every other signal", () => {
  assert.equal(
    projectDepartment({
      department_hint: "copy",
      has_board: true,
      track: "seo_geo",
      stage_type: "creative",
    }),
    "copy",
  );
  assert.equal(projectDepartment({ department_hint: "web" }), "web");
  assert.equal(projectDepartment({ department_hint: "social" }), "social");
});

test("an unknown tag falls through to the board, track and stage", () => {
  assert.equal(
    projectDepartment({ department_hint: "other", has_board: true }),
    "creative",
  );
  assert.equal(
    projectDepartment({ has_board: true, track: "seo_geo" }),
    "creative",
  );
  assert.equal(projectDepartment({ track: "seo_geo" }), "seo");
  assert.equal(projectDepartment({ track: "social_organic" }), "social");
  assert.equal(
    projectDepartment({ track: "campaigns", stage_type: "copy" }),
    "copy",
  );
});

test("the stage decides when the track does not", () => {
  assert.equal(projectDepartment({ stage_type: "copy" }), "copy");
  assert.equal(projectDepartment({ stage_type: "creative" }), "creative");
  assert.equal(projectDepartment({ stage_type: "target_seo" }), "seo");
  assert.equal(projectDepartment({ stage_type: "target_organic" }), "social");
  assert.equal(projectDepartment({ stage_type: "target_paid" }), "campaigns");
  assert.equal(
    projectDepartment({ stage_type: "strategy", has_copy: true }),
    "copy",
  );
});

test("payload content decides last, and creative is the default", () => {
  assert.equal(
    projectDepartment({ has_seo_plan: true, has_copy: true }),
    "seo",
  );
  assert.equal(
    projectDepartment({ has_copy: true, has_creative: true }),
    "copy",
  );
  assert.equal(projectDepartment({ has_creative: true }), "creative");
  assert.equal(projectDepartment({}), "creative");
});
