import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { APPROVAL_ERROR_MESSAGES_HE } from "./carmen/approvals/error-messages.ts";
import {
  buildApprovalFlowAcceptanceCases,
  buildNoPendingRecovery,
  formatApprovalExecutionReply,
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  isMetaApprovalTool,
  pickLatestPendingApproval,
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

Deno.test(
  "an execution with an unknown outcome never claims nothing was done",
  () => {
    const reply = formatApprovalExecutionReply(
      { error: "boom", outcome_unknown: true },
      { title: "השהיית קמפיין" },
    );
    assertMatch(reply, /ייתכן שהפעולה כן בוצעה/);
    assertNotMatch(reply, /לא בוצע כלום/);
  },
);
