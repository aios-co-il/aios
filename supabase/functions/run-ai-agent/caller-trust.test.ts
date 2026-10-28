import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readdirSync, readFileSync } from "node:fs";
import { SERVICE_ONLY_RUN_FIELDS, bindRunAgentCaller } from "./caller-trust.ts";

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

// The service-only fields are trusted only because these callers use the service
// key and the browser never sends them, so the guards below keep that true.
const agent = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

Deno.test("bindRunAgentCaller", async (t) => {
  await t.step(
    "a user JWT runs as itself, without phone, WhatsApp target or whatsapp surface",
    () => {
      const body = bindRunAgentCaller(forgedBody(), {
        kind: "user",
        userId: USER,
      });
      assertStrictEquals(body.user_id, USER);
      for (const field of SERVICE_ONLY_RUN_FIELDS)
        assertStrictEquals(field in body, false, `${field} must be stripped`);
      assertStrictEquals(body.lead_data, undefined);
      assertStrictEquals(body.wa_notify, undefined);
      assertStrictEquals(body.surface, "internal_chat");
      assertStrictEquals(body.command_text, "כן 4821");
      assertStrictEquals(body.tenant_id, "t1");
    },
  );

  await t.step("in-app surfaces are kept for user callers", () => {
    for (const surface of ["internal_chat", "aios", "task", undefined]) {
      const body = bindRunAgentCaller(
        { surface },
        { kind: "user", userId: USER },
      );
      assertStrictEquals(body.surface, surface);
    }
  });

  await t.step(
    "service callers keep phone, WhatsApp target, surface and user",
    () => {
      const body = bindRunAgentCaller(forgedBody(), {
        kind: "service",
        userId: null,
      });
      assertEquals(body, forgedBody());
    },
  );

  await t.step(
    "an unknown caller kind is treated like a user without identity",
    () => {
      const body = bindRunAgentCaller(forgedBody(), {
        kind: "anon",
        userId: OWNER,
      });
      assertStrictEquals(body.user_id, null);
      assertStrictEquals(body.lead_data, undefined);
      assertStrictEquals(body.wa_notify, undefined);
      assertStrictEquals(body.surface, "internal_chat");
    },
  );
});

Deno.test("service-only fields: source guards", async (t) => {
  await t.step(
    "run-ai-agent binds the caller before any use of the body",
    () => {
      const serveAt = agent.indexOf("Deno.serve(async (req) =>");
      assert(serveAt > 0, "Deno.serve entry point not found");
      const serve = agent.slice(serveAt);
      const bindAt = serve.indexOf("bindRunAgentCaller(bodyJson, auth);");
      assert(
        bindAt > 0,
        "Deno.serve must call bindRunAgentCaller(bodyJson, auth)",
      );
      assert(bindAt > serve.indexOf("await req.json()"));
      for (const later of [
        "bodyJson.direct_tool",
        "const surface: Surface",
        "resolveBrainEngine(",
        "handleRunAgent(",
      ])
        assert(
          bindAt < serve.indexOf(later),
          `bindRunAgentCaller must run before ${later}`,
        );
      assertMatch(
        agent,
        /import \{ bindRunAgentCaller \} from "\.\/caller-trust\.ts";/,
      );
    },
  );

  await t.step(
    "WhatsApp and automation callers that set these fields use the service key",
    () => {
      const carmen = readFileSync(
        new URL("../_shared/carmen.ts", import.meta.url),
        "utf8",
      );
      const run = carmen.slice(
        carmen.indexOf("export async function runCarmenAI"),
      );
      assertMatch(run, /lead_data:/);
      assertMatch(run, /wa_notify:/);
      assertMatch(run, /Authorization: `Bearer \$\{serviceKey\}`/);
      const automation = readFileSync(
        new URL("../trigger-automation/index.ts", import.meta.url),
        "utf8",
      );
      const calls = automation.split("fetch(agentUrl, {").slice(1);
      assert(calls.length >= 1);
      for (const call of calls)
        assertMatch(
          call.slice(0, 300),
          /Authorization: `Bearer \$\{Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\}`/,
        );
    },
  );

  await t.step(
    "the browser never sends service-only fields or the whatsapp surface",
    () => {
      const files = walk(new URL("../../../src/", import.meta.url));
      assert(files.length > 0);
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        assertNotMatch(src, /\blead_data\b|\bwa_notify\b/, String(file));
        assertNotMatch(src, /surface:\s*["']whatsapp["']/, String(file));
      }
    },
  );
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
