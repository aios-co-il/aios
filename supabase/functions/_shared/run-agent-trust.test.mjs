import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  APPROVAL_DECISION_TOOLS,
  SERVICE_ONLY_RUN_FIELDS,
  automationApprovalRefusal,
  bindAutomationAgentCaller,
  bindRunAgentCaller,
  isAutomationRun,
  runCallerPhone,
  runMayDecideApprovals,
} from "./run-agent-trust.mjs";
import {
  approvalShortCode,
  parseApprovalReply,
  resolveApprovalConfirm,
} from "./wa-approval-flow.mjs";

const USER = "22222222-2222-4222-8222-222222222222";
const OWNER = "11111111-1111-4111-8111-111111111111";

const forgedBody = () => ({
  tenant_id: "t1",
  user_id: OWNER,
  command_text: "כן 4821",
  surface: "whatsapp",
  lead_data: { phone: "+972500000000", channel: "whatsapp_private" },
  wa_notify: { surface: "whatsapp", chat_id: "972500000000@c.us" },
  model_override: "some-model",
  carmen_automation: { instructions: "x" },
});

test("a user JWT runs as itself, without phone, WhatsApp target or whatsapp surface", () => {
  const body = bindRunAgentCaller(forgedBody(), {
    kind: "user",
    userId: USER,
  });
  assert.equal(body.user_id, USER);
  for (const field of SERVICE_ONLY_RUN_FIELDS)
    assert.equal(field in body, false, `${field} must be stripped`);
  assert.equal(body.lead_data, undefined);
  assert.equal(body.wa_notify, undefined);
  assert.equal(body.surface, "internal_chat");
  assert.equal(body.command_text, "כן 4821");
  assert.equal(body.tenant_id, "t1");
});

test("in-app surfaces are kept for user callers", () => {
  for (const surface of ["internal_chat", "aios", "task", undefined]) {
    const body = bindRunAgentCaller(
      { surface },
      { kind: "user", userId: USER },
    );
    assert.equal(body.surface, surface);
  }
});

test("service callers keep phone, WhatsApp target, surface and user", () => {
  const body = bindRunAgentCaller(forgedBody(), {
    kind: "service",
    userId: null,
  });
  assert.deepEqual(body, forgedBody());
});

test("an unknown caller kind is treated like a user without identity", () => {
  const body = bindRunAgentCaller(forgedBody(), {
    kind: "anon",
    userId: OWNER,
  });
  assert.equal(body.user_id, null);
  assert.equal(body.lead_data, undefined);
  assert.equal(body.wa_notify, undefined);
  assert.equal(body.surface, "internal_chat");
});

// ── Source guards: the binding stays in run-ai-agent's entry point ──────────

const agent = readFileSync(
  new URL("../run-ai-agent/index.ts", import.meta.url),
  "utf8",
);

test("run-ai-agent binds the caller before any use of the body", () => {
  const serveAt = agent.indexOf("Deno.serve(async (req) =>");
  assert.ok(serveAt > 0, "Deno.serve entry point not found");
  const serve = agent.slice(serveAt);
  const bindAt = serve.indexOf("bindRunAgentCaller(bodyJson, auth);");
  assert.ok(
    bindAt > 0,
    "Deno.serve must call bindRunAgentCaller(bodyJson, auth)",
  );
  assert.ok(bindAt > serve.indexOf("await req.json()"));
  for (const later of [
    "bodyJson.direct_tool",
    "const surface: Surface",
    "resolveBrainEngine(",
    "handleRunAgent(",
  ])
    assert.ok(
      bindAt < serve.indexOf(later),
      `bindRunAgentCaller must run before ${later}`,
    );
  assert.match(
    agent,
    /import \{[^}]*\bbindRunAgentCaller\b[^}]*\} from "\.\.\/_shared\/run-agent-trust\.mjs";/,
  );
});

test("WhatsApp and automation callers that set these fields use the service key", () => {
  const carmen = readFileSync(new URL("./carmen.ts", import.meta.url), "utf8");
  const run = carmen.slice(carmen.indexOf("export async function runCarmenAI"));
  assert.match(run, /lead_data:/);
  assert.match(run, /wa_notify:/);
  assert.match(run, /Authorization: `Bearer \$\{serviceKey\}`/);
  const automation = readFileSync(
    new URL("../trigger-automation/index.ts", import.meta.url),
    "utf8",
  );
  const calls = automation.split("fetch(agentUrl, {").slice(1);
  assert.ok(calls.length >= 1);
  for (const call of calls)
    assert.match(
      call.slice(0, 300),
      /Authorization: `Bearer \$\{Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\}`/,
    );
});

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("the browser never sends service-only fields or the whatsapp surface", () => {
  const files = walk(new URL("../../../src/", import.meta.url));
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /\blead_data\b|\bwa_notify\b/, String(file));
    assert.doesNotMatch(src, /surface:\s*["']whatsapp["']/, String(file));
  }
});

// ── Automation runs (AIO-241) ────────────────────────────────────────────────
//
// trigger-automation calls run-ai-agent with the service key, so bindRunAgentCaller
// keeps whatever its body says. Before AIO-241 any tenant member could fire a
// trigger type with data.phone = the owner's phone and command_text "כן 1234":
// Carmen resolved the owner from the phone and approved the owner's request.

const INVOKER = "33333333-3333-4333-8333-333333333333";
const AUTOMATION = "44444444-4444-4444-8444-444444444444";
const OWNER_PHONE = "+972 50-111-2222";
const NOW = Date.parse("2026-10-26T10:00:00Z");

// run-ai-agent's caller resolution (2.5/2.6): the phone's campaigner profile wins
// over user_id; the role comes from that user.
const PEOPLE = [
  { userId: OWNER, phone: "050-1112222", role: "owner" },
  { userId: INVOKER, phone: "052-3334444", role: "campaigner" },
];
const last9 = (p) => String(p).replace(/\D/g, "").slice(-9);
function resolveRunCaller(body) {
  const phone = runCallerPhone(body);
  const byPhone =
    phone && last9(phone).length >= 9
      ? PEOPLE.find((p) => last9(p.phone) === last9(phone))
      : null;
  const userId =
    byPhone?.userId ||
    (body.user_id && body.user_id !== "system" ? body.user_id : null);
  const role = PEOPLE.find((p) => p.userId === userId)?.role ?? null;
  return { userId, role };
}

// An owner-only request (money) the owner queued; its chat code is 1234.
const ownerRow = {
  id: "000004d2-0000-4000-8000-000000000001",
  action_type: "carmen_tool",
  tool_name: "fb_update_budget",
  status: "pending",
  requested_by: OWNER,
  created_at: new Date(NOW - 5 * 60_000).toISOString(),
  expires_at: new Date(NOW + 60 * 60_000).toISOString(),
  context: {},
  run_id: null,
};

// What run-ai-agent does with an approval reply: the fast path and the tools both
// need runMayDecideApprovals; the row is picked for the resolved caller.
function approvalOutcome(body) {
  const reply = parseApprovalReply(String(body.command_text || ""));
  if (!(reply.approve || reply.reject)) return { decided: null, blocked: null };
  if (!runMayDecideApprovals(body))
    return { decided: null, blocked: "automation_run" };
  const caller = resolveRunCaller(body);
  const pick = resolveApprovalConfirm([ownerRow], {
    userId: caller.userId,
    roles: caller.role ? [caller.role] : [],
    code: reply.code,
    mode: reply.approve ? "approve" : "reject",
    nowMs: NOW,
  });
  return {
    decided: pick.kind === "match" ? pick.row.id : null,
    blocked: pick.kind,
  };
}

// The body trigger-automation's non-flow 'agent' action builds from the payload.
const agentActionBody = (payload) => ({
  agent_id: "agent-1",
  command_text: payload.command_text || payload.text || "הפעל את האוטומציה",
  automation_id: AUTOMATION,
  user_name: payload.user_name || "מערכת",
  lead_data: {
    lead_id: payload.lead_id,
    contact_name: payload.contact_name,
    phone: payload.phone,
    email: payload.email,
  },
});

// trigger-automation → run-ai-agent always uses the service key.
const runAiAgentSees = (body) =>
  bindRunAgentCaller(body, { kind: "service", userId: null });

const forgedPayload = {
  phone: OWNER_PHONE,
  command_text: "כן 1234",
  user_name: "דוד",
  contact_name: "ליד",
};

test("the approval code in these tests is 1234", () => {
  assert.equal(approvalShortCode(ownerRow.id), "1234");
});

test("repro: unbound, a payload phone makes the run the owner and 'כן 1234' picks the owner's request", () => {
  const body = runAiAgentSees(agentActionBody(forgedPayload));
  assert.deepEqual(resolveRunCaller(body), { userId: OWNER, role: "owner" });
  const pick = resolveApprovalConfirm([ownerRow], {
    userId: OWNER,
    roles: ["owner"],
    code: "1234",
    nowMs: NOW,
  });
  assert.equal(pick.kind, "match");
});

test("a user-started automation runs as that user, never as the payload's phone", () => {
  const body = runAiAgentSees(
    bindAutomationAgentCaller(agentActionBody(forgedPayload), {
      kind: "user",
      userId: INVOKER,
    }),
  );
  assert.equal(runCallerPhone(body), null);
  assert.equal(body.lead_data.phone, undefined);
  assert.equal(body.lead_data.contact_phone, OWNER_PHONE);
  assert.equal(body.lead_data.contact_name, "ליד");
  assert.equal(body.user_id, INVOKER);
  assert.equal(body.user_name, undefined);
  assert.equal(body.invoked_by_user, true);
  assert.equal(body.command_text, "כן 1234");
  assert.deepEqual(resolveRunCaller(body), {
    userId: INVOKER,
    role: "campaigner",
  });
});

test("a user-started automation with 'כן 1234' decides no approval", () => {
  const body = runAiAgentSees(
    bindAutomationAgentCaller(agentActionBody(forgedPayload), {
      kind: "user",
      userId: INVOKER,
    }),
  );
  assert.deepEqual(approvalOutcome(body), {
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
  assert.notEqual(pick.kind, "match");
  for (const tool of APPROVAL_DECISION_TOOLS)
    assert.equal(
      automationApprovalRefusal(tool)?.error,
      "approval_not_allowed_in_automation",
    );
});

test("a user-started flow agent node loses its WhatsApp target", () => {
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
    { kind: "user", userId: INVOKER },
  );
  assert.equal(body.wa_notify, undefined);
  assert.equal(body.carmen_automation, undefined);
  assert.equal(body.surface, "internal_chat");
  assert.equal(body.automation_id, AUTOMATION);
});

test("an automation run with no proven caller has no identity", () => {
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
    assert.equal(body.user_id, null);
    assert.equal(runCallerPhone(body), null);
    assert.deepEqual(resolveRunCaller(body), { userId: null, role: null });
  }
});

test("lead_data without a phone, or not an object, is handled", () => {
  const noPhone = bindAutomationAgentCaller(
    agentActionBody({ contact_name: "ליד" }),
    { kind: "user", userId: INVOKER },
  );
  assert.equal("contact_phone" in noPhone.lead_data, false);
  assert.equal(noPhone.lead_data.contact_name, "ליד");
  const odd = bindAutomationAgentCaller(
    { automation_id: AUTOMATION, lead_data: "0501112222" },
    { kind: "user", userId: INVOKER },
  );
  assert.equal(odd.lead_data, undefined);
  assert.equal(bindAutomationAgentCaller(null, { kind: "service" }), null);
});

test("a provider webhook (service key) keeps its phone identity but cannot decide approvals", () => {
  const sent = {
    ...agentActionBody({ ...forgedPayload }),
    wa_notify: { surface: "whatsapp", chat_id: "972501112222@c.us" },
  };
  const body = runAiAgentSees(
    bindAutomationAgentCaller(structuredClone(sent), { kind: "service" }),
  );
  assert.deepEqual(body, sent);
  assert.deepEqual(resolveRunCaller(body), { userId: OWNER, role: "owner" });
  assert.equal(isAutomationRun(body), true);
  assert.deepEqual(approvalOutcome(body), {
    decided: null,
    blocked: "automation_run",
  });
});

test("Carmen's WhatsApp session (runCarmenAI) still resolves the sender and approves", () => {
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
  assert.equal(isAutomationRun(body), false);
  assert.equal(runMayDecideApprovals(body), true);
  assert.deepEqual(resolveRunCaller(body), { userId: OWNER, role: "owner" });
  assert.deepEqual(approvalOutcome(body), {
    decided: ownerRow.id,
    blocked: "match",
  });
});

test("isAutomationRun reads only the top-level automation_id", () => {
  assert.equal(isAutomationRun({ automation_id: AUTOMATION }), true);
  assert.equal(isAutomationRun({ automation_id: " " }), false);
  assert.equal(isAutomationRun({ automation_id: null }), false);
  assert.equal(isAutomationRun({}), false);
  assert.equal(isAutomationRun(null), false);
  assert.equal(
    isAutomationRun({ wa_notify: { automation_id: AUTOMATION } }),
    false,
  );
});

test("only approval decisions are refused in an automation run", () => {
  assert.equal(automationApprovalRefusal("list_pending_approvals"), null);
  assert.equal(automationApprovalRefusal("fb_update_budget"), null);
  assert.match(
    automationApprovalRefusal("execute_pending_approval").message,
    /לא בוצע כלום/,
  );
});

test("runCallerPhone reads only lead_data.phone", () => {
  assert.equal(runCallerPhone({ lead_data: { phone: " " } }), null);
  assert.equal(
    runCallerPhone({ lead_data: { phone: 972501112222 } }),
    "972501112222",
  );
  assert.equal(
    runCallerPhone({ lead_data: { contact_phone: OWNER_PHONE } }),
    null,
  );
  assert.equal(runCallerPhone({}), null);
});

// ── Source guards (AIO-241) ──────────────────────────────────────────────────

const automationSrc = readFileSync(
  new URL("../trigger-automation/index.ts", import.meta.url),
  "utf8",
);

test("trigger-automation binds every run-ai-agent call to the proven caller", () => {
  const parts = automationSrc.split("fetch(agentUrl, {");
  assert.ok(parts.length >= 3, "expected the flow node and the agent action");
  for (const before of parts.slice(0, -1)) {
    const tail = before.slice(-2500);
    assert.match(
      tail,
      /bindAutomationAgentCaller\([\s\S]*runCaller,?\s*\)/,
      "each run-ai-agent call must be preceded by bindAutomationAgentCaller(…, runCaller)",
    );
  }
  assert.match(
    automationSrc,
    /import \{ bindAutomationAgentCaller \} from "\.\.\/_shared\/run-agent-trust\.mjs";/,
  );
});

test("trigger-automation takes the caller from both auth checks", () => {
  const declared = automationSrc.indexOf(
    "let runCaller: RunCaller | null = null;",
  );
  assert.ok(declared > 0);
  assert.ok(declared < automationSrc.indexOf("authorizeDirectAutomationRun("));
  assert.equal(
    automationSrc.split("runCaller = decision.caller;").length - 1,
    2,
  );
});

test("runCarmenAI sends no top-level automation_id", () => {
  const carmen = readFileSync(new URL("./carmen.ts", import.meta.url), "utf8");
  const run = carmen.slice(carmen.indexOf("export async function runCarmenAI"));
  const start = run.indexOf("const body = JSON.stringify({");
  assert.ok(start > 0);
  const body = run.slice(start, run.indexOf("\n  });", start));
  assert.doesNotMatch(body, /\bautomation_id\s*:/);
});

test("run-ai-agent refuses approval decisions in automation runs", () => {
  const flow = agent.slice(
    agent.indexOf("// ─── Chat approval flow (AIO-230) ───"),
    agent.indexOf("// Deterministic path: meeting join URL"),
  );
  assert.ok(flow.length > 0);
  assert.equal(flow.split("mayDecideApprovals &&").length - 1, 2);
  assert.match(
    agent,
    /const mayDecideApprovals = runMayDecideApprovals\(bodyJson\);/,
  );
  const guard = agent.indexOf("automationApprovalRefusal(toolName)");
  const loopExec = agent.search(/result = await executeTool\(\s*toolName,/);
  assert.ok(guard > 0 && loopExec > guard && loopExec - guard < 1500);
  assert.match(agent, /const callerPhone = runCallerPhone\(bodyJson\);/);
});
