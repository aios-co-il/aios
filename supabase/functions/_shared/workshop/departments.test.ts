import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  DEPARTMENTS,
  departmentLabel,
  assignClientErrorMessage,
  departmentScreen,
  isClientLocked,
  isDepartmentId,
  projectDepartment,
} from "./departments.ts";

Deno.test("departments are listed in display order with Hebrew labels", () => {
  assertEquals(
    DEPARTMENTS.map((dept) => dept.id),
    ["creative", "copy", "seo", "social", "web", "campaigns"],
  );
  assertStrictEquals(departmentLabel("creative"), "קריאייטיב");
  assertStrictEquals(departmentLabel("copy"), "קופי");
  assertStrictEquals(departmentLabel("seo"), "SEO / GEO");
  assertStrictEquals(departmentLabel("social"), "סושיאל");
  assertStrictEquals(departmentLabel("web"), "בניית אתרים");
  assertStrictEquals(departmentLabel("campaigns"), "קמפיינים");
});

Deno.test("only departments with a marketing screen link to one", () => {
  assertStrictEquals(departmentScreen("creative"), "creative");
  assertStrictEquals(departmentScreen("copy"), "copy");
  assertStrictEquals(departmentScreen("seo"), "seo");
  // marketing/department/campaigns is still the coming-soon placeholder.
  assertStrictEquals(departmentScreen("campaigns"), null);
  assertStrictEquals(departmentScreen("social"), null);
  assertStrictEquals(departmentScreen("web"), null);
  assertStrictEquals(isDepartmentId("web"), true);
  assertStrictEquals(isDepartmentId("analytics"), false);
  assertStrictEquals(isDepartmentId(null), false);
});

Deno.test("a tagged department wins over every other signal", () => {
  assertStrictEquals(
    projectDepartment({
      department_hint: "copy",
      has_board: true,
      track: "seo_geo",
      stage_type: "creative",
    }),
    "copy",
  );
  assertStrictEquals(projectDepartment({ department_hint: "web" }), "web");
  assertStrictEquals(
    projectDepartment({ department_hint: "social" }),
    "social",
  );
});

Deno.test("an unknown tag falls through to the board, track and stage", () => {
  assertStrictEquals(
    projectDepartment({ department_hint: "other", has_board: true }),
    "creative",
  );
  assertStrictEquals(
    projectDepartment({ has_board: true, track: "seo_geo" }),
    "creative",
  );
  assertStrictEquals(projectDepartment({ track: "seo_geo" }), "seo");
  assertStrictEquals(projectDepartment({ track: "social_organic" }), "social");
  assertStrictEquals(
    projectDepartment({ track: "campaigns", stage_type: "copy" }),
    "copy",
  );
});

Deno.test("the stage decides when the track does not", () => {
  assertStrictEquals(projectDepartment({ stage_type: "copy" }), "copy");
  assertStrictEquals(projectDepartment({ stage_type: "creative" }), "creative");
  assertStrictEquals(projectDepartment({ stage_type: "target_seo" }), "seo");
  assertStrictEquals(
    projectDepartment({ stage_type: "target_organic" }),
    "social",
  );
  assertStrictEquals(
    projectDepartment({ stage_type: "target_paid" }),
    "campaigns",
  );
  assertStrictEquals(
    projectDepartment({ stage_type: "strategy", has_copy: true }),
    "copy",
  );
});

Deno.test("payload content decides last, and creative is the default", () => {
  assertStrictEquals(
    projectDepartment({ has_seo_plan: true, has_copy: true }),
    "seo",
  );
  assertStrictEquals(projectDepartment({ has_copy: true }), "copy");
  assertStrictEquals(projectDepartment({ has_creative: true }), "creative");
  assertStrictEquals(projectDepartment({}), "creative");
});

Deno.test("SEO and social projects with a client are locked to it", () => {
  assertStrictEquals(
    isClientLocked({ department_hint: "seo", client_id: "c1" }),
    true,
  );
  assertStrictEquals(
    isClientLocked({ track: "social_organic", client_id: "c1" }),
    true,
  );
  assertStrictEquals(isClientLocked({ department_hint: "seo" }), false);
  assertStrictEquals(
    isClientLocked({ department_hint: "copy", client_id: "c1" }),
    false,
  );
  assertStrictEquals(
    isClientLocked({ has_board: true, client_id: "c1" }),
    false,
  );
});

Deno.test(
  "assign errors: the RPC's Hebrew reason, otherwise a plain sentence",
  () => {
    const locked = "פרויקט SEO / GEO נשאר אצל הלקוח שלו";
    assertStrictEquals(assignClientErrorMessage({ message: locked }), locked);
    assertStrictEquals(
      assignClientErrorMessage({
        message: "new row violates row-level security",
      }),
      "לא הצלחנו לשייך את הפרויקט ללקוח",
    );
    assertStrictEquals(
      assignClientErrorMessage({ message: "timeout" }, true),
      "לא הצלחנו לשייך את הפרויקט ללקוח: timeout",
    );
    assertStrictEquals(
      assignClientErrorMessage(null),
      "לא הצלחנו לשייך את הפרויקט ללקוח",
    );
  },
);

Deno.test(
  "creative work with a brief or copy goes to Creative, the screen that lists it",
  () => {
    // isCopyDepartmentItem leaves out variations and static or video projects, whatever
    // brief, copy or copy stage they carry; isCreativeDepartmentItem lists them.
    assertStrictEquals(
      projectDepartment({ has_copy: true, has_creative: true }),
      "creative",
    );
    assertStrictEquals(
      projectDepartment({ stage_type: "copy", has_creative: true }),
      "creative",
    );
    assertStrictEquals(
      projectDepartment({ department_hint: "copy", has_creative: true }),
      "copy",
    );
  },
);
