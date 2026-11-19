import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  leadStatusGuard,
  leadStillInStatus,
  parseLeadStatusGuard,
} from "./status-guard.ts";

Deno.test("leadStatusGuard", async (t) => {
  await t.step("guards the response status a lead moved to", () => {
    assertEquals(
      leadStatusGuard({
        lead_id: "lead-1",
        new_status: "custom_1",
        status_kind: "response_status",
      }),
      { lead_id: "lead-1", column: "response_status", value: "custom_1" },
    );
  });

  await t.step("guards the funnel stage when no kind is given", () => {
    assertEquals(leadStatusGuard({ lead_id: "lead-1", new_status: "won" }), {
      lead_id: "lead-1",
      column: "status",
      value: "won",
    });
  });

  await t.step("is null without a lead or a new status", () => {
    assertStrictEquals(leadStatusGuard({ new_status: "won" }), null);
    assertStrictEquals(leadStatusGuard({ lead_id: "lead-1" }), null);
    assertStrictEquals(leadStatusGuard(null), null);
  });
});

Deno.test("parseLeadStatusGuard", async (t) => {
  await t.step("round-trips a stored guard", () => {
    const guard = leadStatusGuard({ lead_id: "lead-1", new_status: "won" });
    assertEquals(
      parseLeadStatusGuard(JSON.parse(JSON.stringify(guard))),
      guard,
    );
  });

  await t.step("rejects JSON that is not a guard", () => {
    assertStrictEquals(parseLeadStatusGuard(null), null);
    assertStrictEquals(
      parseLeadStatusGuard({ lead_id: "l", column: "email", value: "x" }),
      null,
    );
  });
});

Deno.test("leadStillInStatus", async (t) => {
  const guard = {
    lead_id: "lead-1",
    column: "response_status",
    value: "custom_1",
  } as const;

  await t.step("is true while the lead holds the guarded status", () => {
    assertStrictEquals(
      leadStillInStatus(guard, { status: "new", response_status: "custom_1" }),
      true,
    );
  });

  await t.step("is false once the lead moved on", () => {
    assertStrictEquals(
      leadStillInStatus(guard, { status: "new", response_status: "closed" }),
      false,
    );
  });

  await t.step("ignores the same key on the other status column", () => {
    assertStrictEquals(
      leadStillInStatus(guard, { status: "custom_1", response_status: null }),
      false,
    );
  });

  await t.step("is false when the lead is gone", () => {
    assertStrictEquals(leadStillInStatus(guard, null), false);
  });
});
