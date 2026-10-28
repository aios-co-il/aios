import { assertStrictEquals } from "jsr:@std/assert@1";
import { resolveApprovalConfirm } from "./resolve.ts";
import { DANA, ID1, ID2, NOW, owner, row } from "./test-fixtures.ts";
import { approvalPickToolResult } from "./tool-result.ts";

Deno.test("approvalPickToolResult", async (t) => {
  await t.step(
    "execute_pending_approval never runs a row other than the bound one",
    () => {
      const pick = resolveApprovalConfirm(
        [row(ID1), row(ID2, { requested_by: DANA })],
        owner,
      );
      assertStrictEquals(pick.kind, "match");
      const res = approvalPickToolResult(pick, {
        requestedId: ID2,
        nowMs: NOW,
      });
      assertStrictEquals(res.success, false);
      assertStrictEquals(res.error, "approval_not_bound");
      assertStrictEquals(res.claim_execution, false);
      const none = approvalPickToolResult(resolveApprovalConfirm([], owner), {
        nowMs: NOW,
      });
      assertStrictEquals(none.error, "no_bound_approval");
    },
  );
});
