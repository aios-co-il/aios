import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { bindRunAgentCaller } from "../caller-trust.ts";
import { approvalShortCode } from "./codes.ts";
import {
  APPROVAL_DECISION_SURFACES,
  APPROVAL_DECISION_TOOLS,
  approvalDecisionRefusal,
  approvalScopedTools,
  isAutomationRun,
  runMayDecideApprovals,
} from "./decision-scope.ts";
import { resolveApprovalConfirm } from "./resolve.ts";
import {
  AUTOMATION,
  NOW,
  OWNER,
  OWNER_PHONE,
  agentActionBody,
  approvalOutcome,
  forgedPayload,
  ownerRow,
  resolveRunCaller,
  runAiAgentSees,
} from "./test-runs.ts";

Deno.test("isAutomationRun", async (t) => {
  await t.step("reads only the top-level automation_id", () => {
    assertStrictEquals(isAutomationRun({ automation_id: AUTOMATION }), true);
    assertStrictEquals(isAutomationRun({ automation_id: " " }), false);
    assertStrictEquals(isAutomationRun({ automation_id: null }), false);
    assertStrictEquals(isAutomationRun({}), false);
    assertStrictEquals(isAutomationRun(null), false);
    assertStrictEquals(
      isAutomationRun({ wa_notify: { automation_id: AUTOMATION } }),
      false,
    );
  });
});

Deno.test("runMayDecideApprovals", async (t) => {
  await t.step("only surfaces where a person types decide approvals", () => {
    assertEquals(APPROVAL_DECISION_SURFACES, [
      "internal_chat",
      "aios",
      "whatsapp",
      "grok_bot",
    ]);
    for (const surface of APPROVAL_DECISION_SURFACES) {
      assertStrictEquals(runMayDecideApprovals({ surface }), true, surface);
      assertStrictEquals(runMayDecideApprovals({}, surface), true, surface);
      for (const tool of APPROVAL_DECISION_TOOLS) {
        assertStrictEquals(approvalDecisionRefusal(tool, {}, surface), null);
      }
    }

    // run-ai-agent treats a missing surface as internal_chat.
    assertStrictEquals(runMayDecideApprovals({}), true);
    // The surface run-ai-agent resolved wins over the body's.
    assertStrictEquals(
      runMayDecideApprovals({ surface: "aios" }, "task"),
      false,
    );
    assertStrictEquals(
      runMayDecideApprovals({ automation_id: AUTOMATION }, "whatsapp"),
      false,
    );
  });

  await t.step(
    "the tasks screen (user JWT, surface task) decides no approval",
    () => {
      const body = bindRunAgentCaller(
        { command_text: "כן 1234", surface: "task", tenant_id: "t1" },
        { kind: "user", userId: OWNER },
      );
      assertStrictEquals(body.surface, "task");
      assertStrictEquals(runMayDecideApprovals(body), false);
    },
  );
});

Deno.test("approvalScopedTools", async (t) => {
  await t.step(
    "a run that may not decide approvals never sees the decision tools",
    () => {
      const tools = [
        { name: "list_pending_approvals" },
        { name: "execute_pending_approval" },
        { name: "fb_update_budget" },
        { name: "reject_pending_approval" },
      ];
      assertStrictEquals(approvalScopedTools(tools, true), tools);
      assertEquals(
        approvalScopedTools(tools, false).map((t) => t.name),
        ["list_pending_approvals", "fb_update_budget"],
      );
      assertEquals(approvalScopedTools([], false), []);
    },
  );
});

Deno.test("approvalDecisionRefusal", async (t) => {
  await t.step(
    "only approval decisions are refused in an automation run",
    () => {
      const run = { automation_id: AUTOMATION };
      assertStrictEquals(
        approvalDecisionRefusal("list_pending_approvals", run),
        null,
      );
      assertStrictEquals(
        approvalDecisionRefusal("fb_update_budget", run),
        null,
      );
      assertMatch(
        approvalDecisionRefusal("execute_pending_approval", run)?.message ?? "",
        /^לא בוצע כלום\. אוטומציה לא מאשרת/,
      );
      // A chat a person types in is not refused.
      assertStrictEquals(
        approvalDecisionRefusal(
          "execute_pending_approval",
          {},
          "internal_chat",
        ),
        null,
      );
    },
  );
});

Deno.test("approval replies by who started the run", async (t) => {
  await t.step("the approval code in these tests is 1234", () => {
    assertStrictEquals(approvalShortCode(ownerRow.id), "1234");
  });

  await t.step(
    "repro: unbound, a payload phone makes the run the owner and 'כן 1234' picks the owner's request",
    () => {
      const body = runAiAgentSees(agentActionBody(forgedPayload));
      assertEquals(resolveRunCaller(body), { userId: OWNER, role: "owner" });
      const pick = resolveApprovalConfirm([ownerRow], {
        userId: OWNER,
        roles: ["owner"],
        code: "1234",
        nowMs: NOW,
      });
      assertStrictEquals(pick.kind, "match");
    },
  );

  await t.step(
    "Carmen's WhatsApp session (runCarmenAI) still resolves the sender and approves",
    () => {
      // The body runCarmenAI sends from green-api-webhook / manus-wa-webhook.
      const body = runAiAgentSees({
        agent_id: "agent-1",
        command_text: "כן 1234",
        conversation_history: [],
        tenant_id: "t1",
        user_name: "דוד",
        lead_data: { phone: OWNER_PHONE, channel: "whatsapp_private" },
        surface: "whatsapp",
        wa_notify: {
          surface: "whatsapp",
          tenant_id: "t1",
          automation_id: AUTOMATION,
          connection_user_id: OWNER,
          chat_id: "972501112222@c.us",
          phone_number: OWNER_PHONE,
          is_group: false,
        },
        carmen_automation: { carmen_instructions: "x" },
      });
      assertStrictEquals(isAutomationRun(body), false);
      assertStrictEquals(runMayDecideApprovals(body), true);
      assertEquals(resolveRunCaller(body), { userId: OWNER, role: "owner" });
      assertEquals(approvalOutcome(body), {
        decided: ownerRow.id,
        blocked: "match",
      });
    },
  );

  // run-agent-task runs a task's description as command_text, with the service
  // key, user_id = the task's creator and surface 'task'. A model or an automation
  // can write that description (create_agent_task, delegate_parallel), so "כן 1234"
  // in a task would approve the creator's request without the creator typing it.
  await t.step("a task run with 'כן 1234' decides no approval", () => {
    const body = taskRunBody("כן 1234");
    assertEquals(resolveRunCaller(body), { userId: OWNER, role: "owner" });
    assertStrictEquals(isAutomationRun(body), false);
    assertStrictEquals(runMayDecideApprovals(body), false);
    assertStrictEquals(runMayDecideApprovals(body, "task"), false);
    assertEquals(approvalOutcome(body), { decided: null, blocked: "surface" });
    assertEquals(approvalOutcome(taskRunBody("לא 1234")), {
      decided: null,
      blocked: "surface",
    });
    for (const tool of APPROVAL_DECISION_TOOLS) {
      const refusal = approvalDecisionRefusal(tool, body, "task");
      assertStrictEquals(refusal?.success, false);
      assertStrictEquals(refusal?.error, "approval_not_allowed_in_task");
      assertMatch(refusal?.message ?? "", /^לא בוצע כלום\. משימה לא מאשרת/);
    }
  });
});

/** The body run-agent-task sends for a task with this description. */
function taskRunBody(description: string) {
  return runAiAgentSees({
    tenant_id: "t1",
    agent_id: "agent-1",
    command_text: description,
    user_id: OWNER,
    conversation_history: [],
    surface: "task",
  });
}
