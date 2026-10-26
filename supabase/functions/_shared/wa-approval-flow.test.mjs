import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
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
