import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readdirSync, readFileSync } from "node:fs";
import { readRunSource } from "./run-source.test-fixture.ts";

// The service-only fields are trusted only because these callers use the service
// key and the browser never sends them, so the guards below keep that true.
const entry = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

const agent = readFileSync(
  new URL("./request/handle.ts", import.meta.url),
  "utf8",
);

Deno.test("service-only fields: source guards", async (t) => {
  await t.step(
    "run-ai-agent binds the caller before any use of the body",
    () => {
      assertMatch(entry, /Deno\.serve\(handleRequest\);/);
      const serveAt = agent.indexOf(
        "export async function handleRequestWithDependencies(",
      );
      assert(serveAt > 0, "request handler not found");
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
        "resolvePickAwareEngine(",
        "handleRunAgent(",
      ]) {
        assert(
          bindAt < serve.indexOf(later),
          `bindRunAgentCaller must run before ${later}`,
        );
      }

      assert(
        !serve.split("runTenantDenied(")[0].includes("resolvePickAwareEngine("),
        "tenant authorization must precede stored brain selection",
      );

      assertMatch(
        agent,
        /import \{[^}]*\bbindRunAgentCaller\b[^}]*\} from "\.\.\/caller-trust\.ts";/,
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

      for (const call of calls) {
        assertMatch(
          call.slice(0, 300),
          /Authorization: `Bearer \$\{Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\}`/,
        );
      }
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

Deno.test("automation and task runs: source guards", async (t) => {
  await t.step("runCarmenAI sends no top-level automation_id", () => {
    const carmen = readFileSync(
      new URL("../_shared/carmen.ts", import.meta.url),
      "utf8",
    );
    const run = carmen.slice(
      carmen.indexOf("export async function runCarmenAI"),
    );
    const start = run.indexOf("const body = JSON.stringify({");
    assert(start > 0);
    const body = run.slice(start, run.indexOf("\n  });", start));
    assertNotMatch(body, /\bautomation_id\s*:/);
  });

  await t.step(
    "run-ai-agent refuses approval decisions outside a person's message",
    () => {
      const flow =
        readRunSource("pick-run-approval") +
        "\n" +
        readRunSource("execute-run-approval");
      assert(flow.length > 0);
      assertStrictEquals(flow.split("mayDecideApprovals &&").length - 1, 2);
      assertMatch(
        readRunSource("initialize-run"),
        /mayDecideApprovals = runMayDecideApprovals\(\s*bodyJson,\s*surface,?\s*\);/,
      );
      const loop = readRunSource("execute-model-tool");
      const guard = loop.indexOf(
        "} else if (!mayDecideApprovals && isApprovalDecisionTool(toolName)) {",
      );
      const loopExec = loop.search(/result = await executeTool\(\s*toolName,/);
      assert(guard > 0 && loopExec > guard && loopExec - guard < 1500);
      assertMatch(
        readRunSource("resolve-run-caller"),
        /callerPhone = runCallerPhone\(bodyJson\);/,
      );
    },
  );

  await t.step(
    "run-ai-agent reads the caller's roles in this tenant only",
    () => {
      const section = readRunSource("resolve-run-caller");
      assertMatch(
        section,
        /\.from\("user_roles"\)\s*\.select\("role"\)\s*\.eq\("user_id", callerUserId\)\s*\.or\(`tenant_id\.eq\.\$\{resolvedTenantId\},tenant_id\.is\.null`\);\s*if \(rolesError\) \{\s*throw rolesError;/,
      );
    },
  );

  await t.step(
    "run-ai-agent learns no instruction from an automation run",
    () => {
      const capture = readRunSource("capture-run-instruction");
      // The guard may also skip a workshop brief (PR 932); it must always skip an automation.
      assertMatch(
        capture,
        /if \(\s*looksLikeInstruction &&\s*resolvedTenantId &&(?:\s*![A-Za-z]+ &&)*\s*!automationRun\s*\) \{/,
      );
    },
  );
});

/** Every .ts/.tsx file under `dir`, recursively. */
function walk(dir: URL, out: Array<URL> = []): Array<URL> {
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
