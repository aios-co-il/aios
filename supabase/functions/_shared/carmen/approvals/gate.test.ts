import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { approverDecision, canApproveRow, canRejectRow } from "./gate.ts";

const DAVID = "11111111-1111-4111-8111-111111111111";
const DANA = "22222222-2222-4222-8222-222222222222";

Deno.test("canApproveRow", async (t) => {
  await t.step(
    "role gate: non-approver may run their own low-risk row only",
    () => {
      const cancel = { tool_name: "cancel_broadcast", requested_by: DANA };
      assertStrictEquals(
        canApproveRow(cancel, { userId: DANA, roles: ["campaigner"] }).ok,
        true,
      );
      assertStrictEquals(
        canApproveRow(cancel, {
          userId: "33333333-3333-4333-8333-333333333333",
          roles: ["campaigner"],
        }).reason,
        "not_requester",
      );
      assertStrictEquals(
        canApproveRow(cancel, { userId: null, roles: ["owner"] }).reason,
        "no_identity",
      );
    },
  );
});

Deno.test("approverDecision", async (t) => {
  await t.step(
    "approverDecision: tenant, role and reject rules for the executor",
    () => {
      const money = { tool_name: "fb_update_budget", requested_by: DANA };
      assertEquals(approverDecision({ row: money, userId: null }), {
        ok: false,
        status: 403,
        error: "approver_required",
      });
      assertStrictEquals(
        approverDecision({
          row: money,
          userId: DAVID,
          roles: ["owner"],
          member: false,
        }).status,
        404,
      );
      assertStrictEquals(
        approverDecision({
          row: money,
          userId: DAVID,
          roles: ["super_admin"],
          member: false,
        }).ok,
        true,
      );
      assertStrictEquals(
        approverDecision({
          row: money,
          userId: DANA,
          roles: ["campaigner"],
          member: true,
        }).error,
        "approver_role_required",
      );
      // A requester may withdraw (reject) their own request without an approver role.
      assertStrictEquals(
        approverDecision({
          row: money,
          userId: DANA,
          roles: ["campaigner"],
          member: true,
          mode: "reject",
        }).ok,
        true,
      );
      assertStrictEquals(
        canRejectRow(money, { userId: DAVID, roles: ["team_manager"] }).ok,
        false,
      );
    },
  );
});
