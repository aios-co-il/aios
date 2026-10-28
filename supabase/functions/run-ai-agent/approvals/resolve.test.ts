import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { canApproveRow } from "../../_shared/carmen/approvals/gate.ts";
import {
  buildApprovalPickPromptRule,
  formatApprovalPickReply,
} from "./chat-text.ts";
import { approvalShortCode } from "./codes.ts";
import {
  APPROVAL_CONFIRM_WINDOW_MS,
  isDeterministicApprovalPick,
  resolveApprovalConfirm,
} from "./resolve.ts";
import {
  CONV,
  DANA,
  DAVID,
  ID1,
  ID2,
  ID3,
  NOW,
  minutesAgo,
  owner,
  row,
} from "./test-fixtures.ts";

Deno.test("resolveApprovalConfirm: a bare כן", async (t) => {
  await t.step("כן runs the caller's own row from this conversation", () => {
    const pick = resolveApprovalConfirm([row(ID1)], owner);
    assertStrictEquals(pick.kind, "match");
    assertStrictEquals(pick.via, "bound");
    assertStrictEquals(pick.row.id, ID1);
  });

  await t.step("another user's row is not confirmed by a bare כן", () => {
    const pick = resolveApprovalConfirm(
      [row(ID1, { requested_by: DANA })],
      owner,
    );
    assertStrictEquals(pick.kind, "none");
    // An approver still sees it as a candidate to pick by code.
    assertEquals(
      pick.candidates.map((r) => r.id),
      [ID1],
    );
  });

  await t.step(
    "a row from another conversation is not confirmed by a bare כן",
    () => {
      const pick = resolveApprovalConfirm(
        [row(ID1, { context: { conversation_key: "wa:972500000000@c.us" } })],
        owner,
      );
      assertStrictEquals(pick.kind, "none");
    },
  );

  await t.step("expired rows are ignored everywhere", () => {
    const expired = row(ID1, { expires_at: minutesAgo(1) });
    const pick = resolveApprovalConfirm([expired], owner);
    assertStrictEquals(pick.kind, "none");
    assertStrictEquals(pick.candidates.length, 0);
    const byCode = resolveApprovalConfirm([expired], {
      ...owner,
      code: approvalShortCode(ID1),
    });
    assertStrictEquals(byCode.kind, "code_not_found");
  });

  await t.step("rows older than 30 minutes need a code", () => {
    const old = row(ID1, {
      created_at: new Date(
        NOW - APPROVAL_CONFIRM_WINDOW_MS - 60_000,
      ).toISOString(),
    });
    assertStrictEquals(resolveApprovalConfirm([old], owner).kind, "none");
    const byCode = resolveApprovalConfirm([old], {
      ...owner,
      code: approvalShortCode(ID1),
    });
    assertStrictEquals(byCode.kind, "match");
    assertStrictEquals(byCode.via, "code");
  });

  await t.step(
    "two bound rows → ambiguous list with codes, nothing runs",
    () => {
      const pick = resolveApprovalConfirm([row(ID1), row(ID2)], owner);
      assertStrictEquals(pick.kind, "ambiguous");
      assertStrictEquals(pick.candidates.length, 2);
      assertStrictEquals(isDeterministicApprovalPick(pick, "כן"), true);
      const reply = formatApprovalPickReply(pick, { nowMs: NOW });
      assertMatch(reply, /לא ביצעתי כלום/);
      assert(reply.includes(approvalShortCode(ID1)));
      assert(reply.includes(approvalShortCode(ID2)));
      assertMatch(reply, /כן \d{4}/);
    },
  );

  await t.step("no identity → nothing runs and Carmen is told so", () => {
    const pick = resolveApprovalConfirm([row(ID1)], { ...owner, userId: null });
    assertStrictEquals(pick.kind, "no_identity");
    assertStrictEquals(isDeterministicApprovalPick(pick, "כן"), false);
    assertMatch(
      buildApprovalPickPromptRule(pick),
      /אסור לקרוא ל-execute_pending_approval/,
    );
  });

  await t.step(
    "rows the executor cannot run (v2 runs, unknown tools) are not candidates",
    () => {
      const rows = [
        row(ID1, { run_id: "dddddddd-0000-4000-8000-000000000000" }),
        row(ID2, { tool_name: "code_fix", action_type: "code_fix" }),
        row(ID3, {
          tool_name: "send_message",
          action_type: "agent_direct_tool",
        }),
      ];
      const pick = resolveApprovalConfirm(rows, {
        ...owner,
        conversationKey: null,
      });
      assertEquals(
        pick.candidates.map((r) => r.id),
        [ID3],
      );
    },
  );
});

Deno.test("resolveApprovalConfirm: roles and codes", async (t) => {
  await t.step(
    "role gate: a campaigner cannot run a money row, even their own",
    () => {
      const campaigner = {
        userId: DANA,
        roles: ["campaigner"],
        conversationKey: CONV,
        nowMs: NOW,
      };
      const pick = resolveApprovalConfirm(
        [row(ID1, { requested_by: DANA, tool_name: "fb_update_budget" })],
        campaigner,
      );
      assertStrictEquals(pick.kind, "forbidden");
      assertStrictEquals(pick.reason, "approver_role_required");
      assertMatch(formatApprovalPickReply(pick), /בעלים או מנהל\/ת סוכנות/);
      for (const tool of [
        "update_client_retainer",
        "send_broadcast_now",
        "create_automation",
        "delete_lead",
        "some_new_tool",
      ]) {
        assertStrictEquals(
          canApproveRow(
            { tool_name: tool, requested_by: DANA },
            { userId: DANA, roles: ["campaigner"] },
          ).ok,
          false,
          tool,
        );
        assertStrictEquals(
          canApproveRow(
            { tool_name: tool, requested_by: DANA },
            { userId: DAVID, roles: ["agency_owner"] },
          ).ok,
          true,
          tool,
        );
      }
    },
  );

  await t.step("a non-approver cannot pick someone else's row by code", () => {
    const pick = resolveApprovalConfirm(
      [row(ID1, { tool_name: "cancel_broadcast", requested_by: DAVID })],
      {
        userId: DANA,
        roles: ["campaigner"],
        conversationKey: CONV,
        nowMs: NOW,
        code: approvalShortCode(ID1),
      },
    );
    assertStrictEquals(pick.kind, "code_not_found");
  });

  await t.step("an approver picks another user's row with כן <קוד>", () => {
    const rows = [
      row(ID1, { requested_by: DANA }),
      row(ID2, { requested_by: DANA }),
    ];
    const pick = resolveApprovalConfirm(rows, {
      ...owner,
      code: approvalShortCode(ID2),
    });
    assertStrictEquals(pick.kind, "match");
    assertStrictEquals(pick.row.id, ID2);
  });

  await t.step(
    "'לא <קוד>' lets a requester withdraw their own approver-only row",
    () => {
      const dana = {
        userId: DANA,
        roles: ["campaigner"],
        conversationKey: CONV,
        nowMs: NOW,
      };
      const money = row(ID1, {
        requested_by: DANA,
        tool_name: "fb_update_budget",
      });
      const others = row(ID2, {
        requested_by: DAVID,
        tool_name: "fb_update_budget",
      });
      const code = approvalShortCode(ID1);
      // Approve: the role gate still refuses.
      assertStrictEquals(
        resolveApprovalConfirm([money], { ...dana, code }).kind,
        "code_not_found",
      );
      // Reject: the requester may withdraw it, by code or as the bound row.
      const byCode = resolveApprovalConfirm([money, others], {
        ...dana,
        code,
        mode: "reject",
      });
      assertStrictEquals(byCode.kind, "match");
      assertStrictEquals(byCode.row.id, ID1);
      const bound = resolveApprovalConfirm([money], {
        ...dana,
        mode: "reject",
      });
      assertStrictEquals(bound.kind, "match");
      // Not someone else's row.
      assertStrictEquals(
        resolveApprovalConfirm([money, others], {
          ...dana,
          code: approvalShortCode(ID2),
          mode: "reject",
        }).kind,
        "code_not_found",
      );
    },
  );
});
