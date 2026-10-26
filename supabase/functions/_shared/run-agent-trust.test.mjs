import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  SERVICE_ONLY_RUN_FIELDS,
  bindRunAgentCaller,
} from "./run-agent-trust.mjs";

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
    /import \{ bindRunAgentCaller \} from "\.\.\/_shared\/run-agent-trust\.mjs";/,
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
