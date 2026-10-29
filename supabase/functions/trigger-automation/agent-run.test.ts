import {
  assert,
  assertEquals,
  assertMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";
import { fakeTables } from "../_shared/carmen/test-tables.ts";
import { runCallerPhone } from "../run-ai-agent/caller-trust.ts";
import {
  APPROVAL_DECISION_TOOLS,
  approvalDecisionRefusal,
} from "../run-ai-agent/approvals/decision-scope.ts";
import { resolveApprovalConfirm } from "../run-ai-agent/approvals/resolve.ts";
import {
  AUTOMATION,
  INVOKER,
  NOW,
  OWNER,
  OWNER_PHONE,
  SERVICE,
  agentActionBody,
  approvalOutcome,
  forgedPayload,
  ownerRow,
  resolveRunCaller,
  runAiAgentSees,
} from "../run-ai-agent/approvals/test-runs.ts";
import { bindAutomationAgentCaller, prepareAgentRun } from "./agent-run.ts";

const asInvoker: { kind: "user"; userId: string } = {
  kind: "user",
  userId: INVOKER,
};
const CARMEN = { id: "agent-1", name: "כרמן", tenant_id: "t1", active: true };
const target = { tenantId: "t1", agentId: CARMEN.id };

Deno.test("bindAutomationAgentCaller", async (t) => {
  await t.step(
    "a user-started automation runs as that user, never as the payload's phone",
    () => {
      const body = runAiAgentSees(
        bindAutomationAgentCaller(agentActionBody(forgedPayload), asInvoker),
      );
      assertStrictEquals(runCallerPhone(body), null);
      assertStrictEquals(body.lead_data.phone, undefined);
      assertStrictEquals(body.lead_data.contact_phone, OWNER_PHONE);
      assertStrictEquals(body.lead_data.contact_name, "ליד");
      assertStrictEquals(body.user_id, INVOKER);
      assertStrictEquals(body.user_name, undefined);
      assertStrictEquals(body.command_text, "כן 1234");
      assertEquals(resolveRunCaller(body), {
        userId: INVOKER,
        role: "campaigner",
      });
    },
  );

  await t.step(
    "a user-started flow agent node loses its WhatsApp target",
    () => {
      const body = bindAutomationAgentCaller(
        {
          ...agentActionBody(forgedPayload),
          wa_notify: {
            surface: "whatsapp",
            automation_id: AUTOMATION,
            connection_user_id: OWNER,
            chat_id: "972501112222@c.us",
            phone_number: OWNER_PHONE,
            is_group: false,
          },
          carmen_automation: { carmen_instructions: "x" },
          surface: "whatsapp",
        },
        asInvoker,
      );
      assertStrictEquals(body.wa_notify, undefined);
      assertStrictEquals(body.carmen_automation, undefined);
      assertStrictEquals(body.surface, "internal_chat");
      assertStrictEquals(body.automation_id, AUTOMATION);
    },
  );

  await t.step(
    "an automation run with no proven caller has no identity",
    () => {
      for (const caller of [
        null,
        undefined,
        { kind: "anon" },
        { kind: "user", userId: "" },
      ]) {
        const body = bindAutomationAgentCaller(
          agentActionBody(forgedPayload),
          caller,
        );
        assertStrictEquals(body.user_id, null);
        assertStrictEquals(runCallerPhone(body), null);
        assertEquals(resolveRunCaller(body), { userId: null, role: null });
      }
    },
  );

  await t.step(
    "lead_data without a phone, or not an object, is handled",
    () => {
      const noPhone = bindAutomationAgentCaller(
        agentActionBody({ contact_name: "ליד" }),
        asInvoker,
      );
      assertStrictEquals("contact_phone" in noPhone.lead_data, false);
      assertStrictEquals(noPhone.lead_data.contact_name, "ליד");
      const odd = bindAutomationAgentCaller(
        { automation_id: AUTOMATION, lead_data: "0501112222" },
        asInvoker,
      );
      assertStrictEquals(odd.lead_data, undefined);
      assertStrictEquals(bindAutomationAgentCaller(null, SERVICE), null);
    },
  );

  await t.step(
    "a raw service caller is not trusted as a WhatsApp sender",
    () => {
      const body = bindAutomationAgentCaller(
        agentActionBody(forgedPayload),
        SERVICE,
      );
      assertStrictEquals(body.user_id, null);
      assertEquals(resolveRunCaller(body), { userId: null, role: null });
    },
  );

  await t.step(
    "a user-started automation with 'כן 1234' decides no approval",
    () => {
      const body = runAiAgentSees(
        bindAutomationAgentCaller(agentActionBody(forgedPayload), {
          kind: "user",
          userId: INVOKER,
        }),
      );
      assertEquals(approvalOutcome(body), {
        decided: null,
        blocked: "automation_run",
      });
      // Even with approvals open, the invoker may not approve the owner's request.
      const pick = resolveApprovalConfirm([ownerRow], {
        ...resolveRunCaller(body),
        roles: ["campaigner"],
        code: "1234",
        nowMs: NOW,
      });
      assertNotStrictEquals(pick.kind, "match");
      for (const tool of APPROVAL_DECISION_TOOLS) {
        assertStrictEquals(
          approvalDecisionRefusal(tool, body)?.error,
          "approval_not_allowed_in_automation",
        );
      }
    },
  );
});

Deno.test("prepareAgentRun", async (t) => {
  await t.step(
    "refuses a user who may not run Carmen's main brain, before binding",
    async () => {
      const sb = fakeTables({
        ai_agents: [CARMEN],
        carmen_command_center_access: [
          {
            tenant_id: "t1",
            agent_id: CARMEN.id,
            user_id: INVOKER,
            enabled: false,
          },
        ],
      });
      const body = agentActionBody(forgedPayload);
      assertEquals(await prepareAgentRun(sb, asInvoker, target, body), {
        refusal: "אין לך הרשאה למוח הראשי של כרמן. בקש/י גישה ממנהל המערכת.",
      });
      assertStrictEquals(body.lead_data.phone, OWNER_PHONE);
    },
  );

  await t.step("binds the body of a run the user may start", async () => {
    const sb = fakeTables({ ai_agents: [CARMEN] });
    const run = await prepareAgentRun(
      sb,
      asInvoker,
      target,
      agentActionBody(forgedPayload),
    );
    assert("body" in run);
    assertStrictEquals(run.body.user_id, INVOKER);
    assertStrictEquals(runCallerPhone(run.body), null);
  });

  await t.step("a run that acts for no user is not checked", async () => {
    const sb = fakeTables({});
    const sent = agentActionBody(forgedPayload);
    const run = await prepareAgentRun(
      sb,
      { kind: "whatsapp_inbound" },
      target,
      structuredClone(sent),
    );
    assertEquals(run, { body: sent });
    assertEquals(sb.queried, []);
  });

  await t.step(
    "every run-ai-agent call in index.ts sends the body it returned",
    () => {
      const automation = readFileSync(
        new URL("./index.ts", import.meta.url),
        "utf8",
      );
      const calls = automation.split("fetch(agentUrl, {").slice(1);
      assertStrictEquals(calls.length, 2, "the flow node and the agent action");
      for (const call of calls) {
        assertMatch(
          call.slice(0, 500),
          /body: JSON\.stringify\(agentRun\.body\),/,
        );
      }

      assertStrictEquals(
        automation.split("const agentRun = await prepareAgentRun(").length - 1,
        2,
      );
      assertStrictEquals(automation.split("agentRun = ").length - 1, 2);
    },
  );
});
