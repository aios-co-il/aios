import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";
import {
  APPROVAL_CONFIRM_WINDOW_MS,
  CARMEN_EXECUTOR_TOOLS,
  APPROVAL_ERROR_MESSAGES_HE,
  approvalBindingContext,
  approvalCodeMatches,
  approvalConversationKey,
  approvalDisplayCode,
  approvalLongCode,
  approvalPickToolResult,
  approvalRiskClass,
  approvalShortCode,
  approverDecision,
  buildApprovalFlowAcceptanceCases,
  buildApprovalPickPromptRule,
  buildNoPendingRecovery,
  canApproveRow,
  canRejectRow,
  formatApprovalExecutionReply,
  formatApprovalPickReply,
  isDeterministicApprovalPick,
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  isMetaApprovalTool,
  mergeApprovalBinding,
  parseApprovalReply,
  pickLatestPendingApproval,
  resolveApprovalConfirm,
} from "./wa-approval-flow.mjs";

const cases = buildApprovalFlowAcceptanceCases();

Deno.test("WhatsApp approval phrases are detected", () => {
  for (const p of cases.approve) {
    assertStrictEquals(
      isExplicitApprovalPhrase(p),
      true,
      `should approve: ${p}`,
    );
  }
  // Voice-marker prefix + trailing punctuation
  assertStrictEquals(isExplicitApprovalPhrase("🎤 כן"), true);
  assertStrictEquals(isExplicitApprovalPhrase("כן מאשר!"), true);
  assertStrictEquals(isExplicitApprovalPhrase("כן, תעשי את זה"), true);
});

Deno.test("non-approval and reject phrases", () => {
  for (const p of cases.reject) {
    assertStrictEquals(
      isExplicitRejectionPhrase(p),
      true,
      `should reject: ${p}`,
    );
    assertStrictEquals(
      isExplicitApprovalPhrase(p),
      false,
      `reject is not approve: ${p}`,
    );
  }
  for (const p of cases.notApproval) {
    assertStrictEquals(
      isExplicitApprovalPhrase(p),
      false,
      `should not approve: ${p}`,
    );
  }
});

Deno.test("repeated confirmations still count as approval", () => {
  assertStrictEquals(isExplicitApprovalPhrase("כן"), true);
  assertStrictEquals(isExplicitApprovalPhrase("כן מאשר"), true);
  assertStrictEquals(isExplicitApprovalPhrase("מאשר"), true);
  assertStrictEquals(isExplicitApprovalPhrase("כן מאשר"), true);
});

Deno.test("pickLatestPendingApproval prefers Meta tools", () => {
  const rows = [
    {
      id: "1",
      tool_name: "create_broadcast",
      created_at: "2026-08-04T06:00:00Z",
    },
    {
      id: "2",
      tool_name: "fb_duplicate_ad_variants",
      created_at: "2026-08-04T05:59:00Z",
    },
  ];
  // Newest-first list: broadcast is newer, but Meta should win when preferMeta.
  assertStrictEquals(pickLatestPendingApproval(rows)?.id, "2");
  assertStrictEquals(
    pickLatestPendingApproval(rows, { preferMeta: false })?.id,
    "1",
  );
});

Deno.test(
  "buildNoPendingRecovery returns recreate_once for last Meta row",
  () => {
    const recent = [
      {
        id: "a",
        status: "rejected",
        tool_name: "fb_duplicate_ad_variants",
        title: "שכפול ×4",
        tool_input: {
          client_id: "c1",
          source_ad_id: "ad1",
          variants: [{ primary_text: "x" }],
        },
      },
    ];
    const { recovery, instruction_for_carmen } = buildNoPendingRecovery(recent);
    assertStrictEquals(recovery.mode, "recreate_once");
    assertStrictEquals(recovery.tool_name, "fb_duplicate_ad_variants");
    assertStrictEquals(recovery.tool_input.source_ad_id, "ad1");
    assertMatch(instruction_for_carmen, /אישור סופי אחד/);
  },
);

Deno.test(
  "formatApprovalExecutionReply never claims success on failure",
  () => {
    const pending = { title: "שכפול מודעה" };
    assertMatch(
      formatApprovalExecutionReply({ success: true }, pending),
      /בוצע/,
    );
    assertMatch(
      formatApprovalExecutionReply(
        { success: false, error: "no_pending_approval" },
        pending,
      ),
      /לא הצלחתי/,
    );
    assertMatch(
      formatApprovalExecutionReply(
        { success: false, error: "no_pending_approval" },
        pending,
      ),
      /לא בוצע/,
    );
  },
);

Deno.test("isMetaApprovalTool covers duplicate variants", () => {
  assertStrictEquals(isMetaApprovalTool("fb_duplicate_ad_variants"), true);
  assertStrictEquals(isMetaApprovalTool("list_clients"), false);
});

// ── Bound approvals (AIO-230) ──────────────────────────────────────────────

const NOW = Date.parse("2026-10-26T12:00:00Z");
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const inHours = (h) => new Date(NOW + h * 3_600_000).toISOString();
const DAVID = "11111111-1111-4111-8111-111111111111";
const DANA = "22222222-2222-4222-8222-222222222222";
const CONV = "conv:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function row(id, over = {}) {
  return {
    id,
    status: "pending",
    tool_name: "fb_pause",
    action_type: "fb_pause",
    title: `בקשה ${id.slice(0, 4)}`,
    requested_by: DAVID,
    created_at: minutesAgo(5),
    expires_at: inHours(23),
    run_id: null,
    context: { conversation_key: CONV },
    ...over,
  };
}
const ID1 = "a1b2c3d4-0000-4000-8000-000000000001";
const ID2 = "b2c3d4e5-0000-4000-8000-000000000002";
const ID3 = "c3d4e5f6-0000-4000-8000-000000000003";
const owner = {
  userId: DAVID,
  roles: ["owner"],
  conversationKey: CONV,
  nowMs: NOW,
};

Deno.test("כן runs the caller's own row from this conversation", () => {
  const pick = resolveApprovalConfirm([row(ID1)], owner);
  assertStrictEquals(pick.kind, "match");
  assertStrictEquals(pick.via, "bound");
  assertStrictEquals(pick.row.id, ID1);
});

Deno.test("another user's row is not confirmed by a bare כן", () => {
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

Deno.test(
  "a row from another conversation is not confirmed by a bare כן",
  () => {
    const pick = resolveApprovalConfirm(
      [row(ID1, { context: { conversation_key: "wa:972500000000@c.us" } })],
      owner,
    );
    assertStrictEquals(pick.kind, "none");
  },
);

Deno.test("expired rows are ignored everywhere", () => {
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

Deno.test("rows older than 30 minutes need a code", () => {
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

Deno.test("two bound rows → ambiguous list with codes, nothing runs", () => {
  const pick = resolveApprovalConfirm([row(ID1), row(ID2)], owner);
  assertStrictEquals(pick.kind, "ambiguous");
  assertStrictEquals(pick.candidates.length, 2);
  assertStrictEquals(isDeterministicApprovalPick(pick, "כן"), true);
  const reply = formatApprovalPickReply(pick, { nowMs: NOW });
  assertMatch(reply, /לא ביצעתי כלום/);
  assert(reply.includes(approvalShortCode(ID1)));
  assert(reply.includes(approvalShortCode(ID2)));
  assertMatch(reply, /כן \d{4}/);
});

Deno.test(
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

Deno.test("role gate: non-approver may run their own low-risk row only", () => {
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
});

Deno.test("a non-approver cannot pick someone else's row by code", () => {
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

Deno.test("an approver picks another user's row with כן <קוד>", () => {
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

Deno.test("no identity → nothing runs and Carmen is told so", () => {
  const pick = resolveApprovalConfirm([row(ID1)], { ...owner, userId: null });
  assertStrictEquals(pick.kind, "no_identity");
  assertStrictEquals(isDeterministicApprovalPick(pick, "כן"), false);
  assertMatch(
    buildApprovalPickPromptRule(pick),
    /אסור לקרוא ל-execute_pending_approval/,
  );
});

Deno.test(
  "rows the executor cannot run (v2 runs, unknown tools) are not candidates",
  () => {
    const rows = [
      row(ID1, { run_id: "dddddddd-0000-4000-8000-000000000000" }),
      row(ID2, { tool_name: "code_fix", action_type: "code_fix" }),
      row(ID3, { tool_name: "send_message", action_type: "agent_direct_tool" }),
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

Deno.test("parseApprovalReply reads codes and keeps plain phrases", () => {
  assertEquals(parseApprovalReply("כן 4821"), {
    approve: true,
    reject: false,
    code: "4821",
  });
  assertEquals(parseApprovalReply("מאשר, 4821!"), {
    approve: true,
    reject: false,
    code: "4821",
  });
  assertEquals(parseApprovalReply("כן קוד #4821"), {
    approve: true,
    reject: false,
    code: "4821",
  });
  assertEquals(parseApprovalReply("לא 4821"), {
    approve: false,
    reject: true,
    code: "4821",
  });
  assertEquals(parseApprovalReply("כן"), {
    approve: true,
    reject: false,
    code: null,
  });
  assertStrictEquals(parseApprovalReply("4821").approve, false);
  assertStrictEquals(
    parseApprovalReply("כן 4821 וגם תשלחי דוח").approve,
    false,
  );
});

Deno.test(
  "short codes are stable 4-digit codes that avoid years and round hundreds",
  () => {
    assertStrictEquals(approvalShortCode(ID1), approvalShortCode(ID1));
    assertMatch(approvalShortCode(ID1), /^\d{4}$/);
    for (let i = 0; i < 2000; i++) {
      const id = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
      const n = Number(approvalShortCode(id));
      assert(!(n >= 1900 && n <= 2099), id);
      assertNotStrictEquals(n % 100, 0, id);
    }
  },
);

Deno.test(
  "conversation keys: chat id, WhatsApp chat, phone fallback, none",
  () => {
    assertStrictEquals(
      approvalConversationKey({ conversationId: "c1" }),
      "conv:c1",
    );
    assertStrictEquals(
      approvalConversationKey({
        surface: "whatsapp",
        waChatId: "972501234567@c.us",
      }),
      "wa:972501234567@c.us",
    );
    assertStrictEquals(
      approvalConversationKey({
        surface: "whatsapp",
        phone: "+972-50-123-4567",
      }),
      "wa_phone:501234567",
    );
    assertStrictEquals(approvalConversationKey({ surface: "task" }), null);
    assertStrictEquals(approvalBindingContext({ surface: "task" }), null);
  },
);

Deno.test("binding is stamped only on the requester's own unbound row", () => {
  const binding = approvalBindingContext({
    surface: "aios",
    conversationId: "c1",
  });
  const fresh = { requested_by: DAVID, context: { caller_role: "owner" } };
  assertEquals(mergeApprovalBinding(fresh, { userId: DAVID, binding }), {
    caller_role: "owner",
    conversation_key: "conv:c1",
    conversation_surface: "aios",
  });
  assertStrictEquals(
    mergeApprovalBinding(fresh, { userId: DANA, binding }),
    null,
  );
  assertStrictEquals(
    mergeApprovalBinding(
      { requested_by: DAVID, context: { conversation_key: "conv:x" } },
      { userId: DAVID, binding },
    ),
    null,
  );
  assertStrictEquals(
    mergeApprovalBinding(fresh, { userId: DAVID, binding: null }),
    null,
  );
});

Deno.test(
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

Deno.test("risk classes cover every tool the executor runs", () => {
  for (const tool of CARMEN_EXECUTOR_TOOLS)
    assertNotStrictEquals(
      approvalRiskClass({ tool_name: tool }),
      "unknown",
      tool,
    );
});

Deno.test("CARMEN_EXECUTOR_TOOLS matches carmen-approval-execute", () => {
  const src = readFileSync(
    new URL("../carmen-approval-execute/index.ts", import.meta.url),
    "utf8",
  );
  for (const tool of CARMEN_EXECUTOR_TOOLS)
    assert(
      src.includes(`"${tool}"`) || new RegExp(`\\b${tool}:`).test(src),
      `${tool} not handled by carmen-approval-execute`,
    );
});

Deno.test(
  "execute_pending_approval never runs a row other than the bound one",
  () => {
    const pick = resolveApprovalConfirm(
      [row(ID1), row(ID2, { requested_by: DANA })],
      owner,
    );
    assertStrictEquals(pick.kind, "match");
    const res = approvalPickToolResult(pick, { requestedId: ID2, nowMs: NOW });
    assertStrictEquals(res.success, false);
    assertStrictEquals(res.error, "approval_not_bound");
    assertStrictEquals(res.claim_execution, false);
    const none = approvalPickToolResult(resolveApprovalConfirm([], owner), {
      nowMs: NOW,
    });
    assertStrictEquals(none.error, "no_bound_approval");
  },
);

// ── Review fixes (AIO-230) ─────────────────────────────────────────────────

Deno.test(
  "execution replies speak Hebrew and do not blame Meta for other tools",
  () => {
    const broadcast = {
      title: "שליחת ברודקאסט",
      tool_name: "send_broadcast_now",
    };
    const refused = formatApprovalExecutionReply(
      { success: false, error: "approver_role_required" },
      broadcast,
    );
    assertMatch(refused, /בעלים או מנהל\/ת סוכנות/);
    assertMatch(refused, /לא בוצע כלום\.$/);
    assertNotMatch(refused, /approver_role_required|Meta/);
    for (const code of [
      "expired",
      "not_pending",
      "no_identity",
      "unknown_tool",
    ])
      assert(
        formatApprovalExecutionReply({ error: code }, broadcast).includes(
          APPROVAL_ERROR_MESSAGES_HE[code],
        ),
        code,
      );
    // Someone else is running it right now: do not say nothing was done.
    const busy = formatApprovalExecutionReply(
      { error: "in_progress" },
      broadcast,
    );
    assertMatch(busy, /כבר בביצוע/);
    assertNotMatch(busy, /לא בוצע כלום/);
    // Unknown upstream errors pass through as text, objects are not "[object Object]".
    assertMatch(
      formatApprovalExecutionReply({ error: "Meta API 500" }, broadcast),
      /Meta API 500/,
    );
    assertNotMatch(
      formatApprovalExecutionReply(
        { result: { error: { code: 1 } } },
        broadcast,
      ),
      /object Object/,
    );
    assertNotMatch(
      formatApprovalExecutionReply({ error: "constructor" }, broadcast),
      /function/,
    );
  },
);

function collidingId(id) {
  const code = approvalShortCode(id);
  for (let i = 0; i < 1_000_000; i++) {
    const other = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000009`;
    if (other !== id && approvalShortCode(other) === code) return other;
  }
  throw new Error("no collision found");
}

Deno.test(
  "colliding short codes get 6-digit codes so each row can still be picked",
  () => {
    const twin = collidingId(ID1);
    assertStrictEquals(approvalShortCode(twin), approvalShortCode(ID1));
    assertNotStrictEquals(approvalLongCode(twin), approvalLongCode(ID1));
    const rows = [
      row(ID1, { requested_by: DANA }),
      row(twin, { requested_by: DANA }),
      row(ID3, { requested_by: DANA }),
    ];
    // The shared 4 digits are ambiguous; nothing runs.
    const ambiguous = resolveApprovalConfirm(rows, {
      ...owner,
      code: approvalShortCode(ID1),
    });
    assertStrictEquals(ambiguous.kind, "ambiguous");
    const reply = formatApprovalPickReply(ambiguous, { nowMs: NOW });
    assert(reply.includes(approvalLongCode(ID1)), reply);
    assert(reply.includes(approvalLongCode(twin)), reply);
    // Only colliding rows get the long code.
    assertStrictEquals(
      approvalDisplayCode(rows[2], rows),
      approvalShortCode(ID3),
    );
    assertStrictEquals(
      approvalDisplayCode(rows[0], rows),
      approvalLongCode(ID1),
    );
    assertStrictEquals(
      approvalDisplayCode(rows[0], [rows[0]]),
      approvalShortCode(ID1),
    );
    // "כן <6 digits>" picks exactly one.
    for (const id of [ID1, twin]) {
      const reply6 = parseApprovalReply(`כן ${approvalLongCode(id)}`);
      assertStrictEquals(reply6.approve, true);
      const pick = resolveApprovalConfirm(rows, {
        ...owner,
        code: reply6.code,
      });
      assertStrictEquals(pick.kind, "match");
      assertStrictEquals(pick.row.id, id);
    }
    // Tool results list the long codes too.
    const tool = approvalPickToolResult(ambiguous, { nowMs: NOW });
    assertEquals(
      tool.candidates.map((c) => c.code).sort(),
      [approvalLongCode(ID1), approvalLongCode(twin)].sort(),
    );
    assertStrictEquals(
      approvalCodeMatches(rows[2], approvalShortCode(ID3)),
      true,
    );
    assertStrictEquals(
      approvalCodeMatches(rows[2], approvalLongCode(ID1)),
      false,
    );
  },
);

Deno.test("codes are 4 or 6 digits; 5 digits is not a code", () => {
  assertStrictEquals(parseApprovalReply("כן 123456").code, "123456");
  assertStrictEquals(parseApprovalReply("לא 123456").reject, true);
  assertStrictEquals(parseApprovalReply("כן 12345").code, null);
  assertStrictEquals(parseApprovalReply("כן 1234567").code, null);
});

Deno.test(
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
    const bound = resolveApprovalConfirm([money], { ...dana, mode: "reject" });
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

Deno.test(
  "an execution with an unknown outcome never claims nothing was done",
  async () => {
    const { formatApprovalExecutionReply } =
      await import("./wa-approval-flow.mjs");
    const reply = formatApprovalExecutionReply(
      { error: "boom", outcome_unknown: true },
      { title: "השהיית קמפיין" },
    );
    assertMatch(reply, /ייתכן שהפעולה כן בוצעה/);
    assertNotMatch(reply, /לא בוצע כלום/);
  },
);
