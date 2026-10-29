import { assertEquals } from "jsr:@std/assert@1";

import { summarizeExecution } from "./execution-summary.ts";

Deno.test("summarizeExecution", async (t) => {
  await t.step("all automations succeeded → completed", () => {
    assertEquals(
      summarizeExecution([
        { status: "fulfilled", value: { success: true, automation_id: "a" } },
        { status: "fulfilled", value: { success: true, automation_id: "b" } },
      ]),
      { status: "completed", actions_count: 2, error: null },
    );
  });

  await t.step(
    "skipped and conditions-not-met automations are not counted as run",
    () => {
      assertEquals(
        summarizeExecution([
          { status: "fulfilled", value: undefined },
          { status: "fulfilled", value: { success: false, skipped: true } },
        ]),
        { status: "completed", actions_count: 0, error: null },
      );
    },
  );

  await t.step(
    "a failing automation marks the run failed with its error",
    () => {
      assertEquals(
        summarizeExecution([
          { status: "fulfilled", value: { success: true } },
          {
            status: "fulfilled",
            value: { success: false, automation_id: "b", error: "send failed" },
          },
        ]),
        { status: "failed", actions_count: 2, error: "send failed" },
      );
    },
  );

  await t.step(
    "success:false without an error message is still a failure",
    () => {
      assertEquals(
        summarizeExecution([
          {
            status: "fulfilled",
            value: { success: false, automation_id: "c" },
          },
          { status: "fulfilled", value: undefined },
        ]),
        {
          status: "failed",
          actions_count: 1,
          error: "automation reported failure",
        },
      );
    },
  );

  await t.step("a thrown automation counts as run and failed", () => {
    assertEquals(
      summarizeExecution([
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: { success: true } },
        { status: "rejected", reason: new Error("boom") },
      ]),
      { status: "failed", actions_count: 2, error: "boom" },
    );
  });

  await t.step("an object error is recorded as JSON", () => {
    assertEquals(
      summarizeExecution([
        {
          status: "fulfilled",
          value: { success: false, error: { code: "429" } },
        },
      ]).error,
      '{"code":"429"}',
    );
  });

  await t.step("no matching automations → nothing ran", () => {
    assertEquals(summarizeExecution([]), {
      status: "completed",
      actions_count: 0,
      error: null,
    });
  });
});
