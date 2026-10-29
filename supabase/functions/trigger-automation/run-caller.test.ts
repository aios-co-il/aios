import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readdirSync, readFileSync } from "node:fs";
import { runCallerPhone } from "../run-ai-agent/caller-trust.ts";
import { isAutomationRun } from "../run-ai-agent/approvals/decision-scope.ts";
import {
  AUTOMATION,
  INVOKER,
  OWNER,
  OWNER_PHONE,
  SERVICE,
  agentActionBody,
  approvalOutcome,
  flowWebhookRequest,
  resolveRunCaller,
  runAiAgentSees,
  whatsAppInboundRequest,
} from "../run-ai-agent/approvals/test-runs.ts";
import { bindAutomationAgentCaller } from "./agent-run.ts";
import {
  WHATSAPP_INBOUND_TRIGGER_TYPES,
  automationRunCaller,
} from "./run-caller.ts";

const asInvoker: { kind: "user"; userId: string } = {
  kind: "user",
  userId: INVOKER,
};

Deno.test("automationRunCaller", async (t) => {
  await t.step("who an automation run acts for", () => {
    assertEquals(
      automationRunCaller({ trigger_type: "lead_created" }, asInvoker),
      asInvoker,
    );
    assertEquals(automationRunCaller(whatsAppInboundRequest({}), SERVICE), {
      kind: "whatsapp_inbound",
    });
    for (const [request, caller] of [
      // Flow webhooks and lead intake run a chosen automation by id.
      [flowWebhookRequest({ phone: OWNER_PHONE }), SERVICE],
      [{ automationId: AUTOMATION, source: "lead_intake_redirect" }, SERVICE],
      [{ automationId: AUTOMATION, source: "flow" }, SERVICE],
      [{ ...whatsAppInboundRequest({}), automationId: AUTOMATION }, SERVICE],
      // Lead intake, cron and other functions fire other trigger types.
      [{ trigger_type: "lead_created", data: { phone: OWNER_PHONE } }, SERVICE],
      [{ trigger_type: "inbound_webhook_task" }, SERVICE],
      [{ trigger_type: "telegram_message_received" }, SERVICE],
      [{}, SERVICE],
      [null, SERVICE],
      // No proven caller.
      [whatsAppInboundRequest({}), null],
      [whatsAppInboundRequest({}), { kind: "anon" }],
      [whatsAppInboundRequest({}), { kind: "whatsapp_inbound" }],
      [whatsAppInboundRequest({}), { kind: "user", userId: "" }],
    ]) {
      assertStrictEquals(
        automationRunCaller(request, caller),
        null,
        JSON.stringify([request, caller]),
      );
    }

    assertEquals(WHATSAPP_INBOUND_TRIGGER_TYPES, ["whatsapp_message_received"]);
  });

  await t.step(
    "a flow webhook with the owner's phone runs with no identity",
    () => {
      // A member reads the trigger's webhook_secret (RLS lets members read flow
      // steps) and posts the owner's phone; automation-flow-webhook relays it to
      // trigger-automation with the service key.
      const request = flowWebhookRequest({
        phone: OWNER_PHONE,
        command_text: "כן 1234",
        user_name: "דוד",
        chat_id: "972501112222@c.us",
      });
      const body = runAiAgentSees(
        bindAutomationAgentCaller(
          {
            ...agentActionBody(request.data),
            wa_notify: { surface: "whatsapp", chat_id: request.data.chat_id },
            carmen_automation: { carmen_instructions: "x" },
          },
          automationRunCaller(request, SERVICE),
        ),
      );
      assertStrictEquals(body.user_id, null);
      assertStrictEquals(runCallerPhone(body), null);
      assertStrictEquals(body.lead_data.contact_phone, OWNER_PHONE);
      assertStrictEquals(body.wa_notify, undefined);
      assertStrictEquals(body.carmen_automation, undefined);
      assertStrictEquals(body.user_name, undefined);
      assertEquals(resolveRunCaller(body), { userId: null, role: null });
      assertEquals(approvalOutcome(body), {
        decided: null,
        blocked: "automation_run",
      });
    },
  );

  await t.step(
    "a lead whose phone matches a staff member is not that person",
    () => {
      // webhook-lead-intake / facebook-lead-webhook: a public form's phone.
      const request = {
        trigger_type: "lead_created",
        tenant_id: "t1",
        data: { lead_id: "lead-1", phone: "050-1112222", contact_name: "ליד" },
      };
      const body = runAiAgentSees(
        bindAutomationAgentCaller(
          agentActionBody(request.data),
          automationRunCaller(request, SERVICE),
        ),
      );
      assertEquals(resolveRunCaller(body), { userId: null, role: null });
      assertStrictEquals(body.lead_data.contact_phone, "050-1112222");
      assertStrictEquals(body.lead_data.contact_name, "ליד");
    },
  );

  await t.step(
    "a WhatsApp message relayed by the webhook keeps the sender but cannot decide approvals",
    () => {
      const request = whatsAppInboundRequest({
        sender_phone: OWNER_PHONE,
        phone: OWNER_PHONE,
        chat_id: "972501112222@c.us",
        command_text: "כן 1234",
      });
      const sent = {
        ...agentActionBody(request.data),
        wa_notify: { surface: "whatsapp", chat_id: request.data.chat_id },
      };
      const body = runAiAgentSees(
        bindAutomationAgentCaller(
          structuredClone(sent),
          automationRunCaller(request, SERVICE),
        ),
      );
      assertEquals(body, sent);
      assertEquals(resolveRunCaller(body), { userId: OWNER, role: "owner" });
      assertStrictEquals(isAutomationRun(body), true);
      assertEquals(approvalOutcome(body), {
        decided: null,
        blocked: "automation_run",
      });
    },
  );
});

Deno.test("trigger-automation: source guards", async (t) => {
  const automation = readFileSync(
    new URL("./index.ts", import.meta.url),
    "utf8",
  );

  await t.step(
    "trigger-automation takes the caller from both auth checks",
    () => {
      const declared = automation.indexOf(
        "let runCaller: AutomationRunCaller | null = null;",
      );
      assert(declared > 0);
      assert(declared < automation.indexOf("authorizeDirectAutomationRun("));
      assertStrictEquals(
        automation.split(
          "runCaller = automationRunCaller(requestBody, decision.caller);",
        ).length - 1,
        2,
      );
      assertStrictEquals(automation.split("runCaller = ").length - 1, 2);
    },
  );

  await t.step(
    "only green-api-webhook fires WhatsApp-inbound trigger types",
    () => {
      const root = new URL("../", import.meta.url);
      const senders: string[] = [];
      for (const file of walk(root)) {
        const path = String(file);
        // Test code and test helpers (test-*.ts) build requests, not send them.
        if (
          /\.test\.|\/test-[^/]*\.ts$|\/_shared\/database\.types\.ts$/.test(
            path,
          )
        ) {
          continue;
        }

        const src = readFileSync(file, "utf8");
        for (const type of WHATSAPP_INBOUND_TRIGGER_TYPES) {
          if (new RegExp(`trigger_type:\\s*["']${type}["']`).test(src)) {
            senders.push(path.slice(String(root).length));
          }
        }
      }

      assertEquals(senders, ["green-api-webhook/index.ts"]);
    },
  );

  await t.step("automation-flow-webhook runs its automation by id", () => {
    const src = readFileSync(
      new URL("../automation-flow-webhook/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(
      src,
      /automationId: automation\.id,\s*tenant_id: automation\.tenant_id,\s*source: "flow_webhook",\s*data: normalized,/,
    );
  });
});

/** Every .ts/.tsx file under `dir`, recursively. */
function walk(dir: URL, out: URL[] = []): URL[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}
