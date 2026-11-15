import { assertEquals } from "jsr:@std/assert@1";
import { RUNNABLE_COLLECTORS } from "../_shared/manager-round/runnable-collectors.ts";
import { COLLECTORS } from "../carmen-manager-round/collectors/registry.ts";
import { handleRun, type RunDeps } from "./handler.ts";
import type { RunRequest } from "./request.ts";

const TENANT = "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019";

/** A round report with one tenant that ran `collector`. */
function report(collector: string) {
  return {
    round_id: "r1",
    dry_run: false,
    tenants: [
      {
        tenant_id: TENANT,
        mode: "observe",
        collectors: [
          {
            id: collector,
            status: "ok",
            candidates: 3,
            inserted: 1,
            cleared: 2,
            dropped: {},
            llm: { calls: 4, costUsd: 0 },
          },
        ],
      },
    ],
  };
}

/** Deps that record the round calls. */
function deps(overrides: Partial<RunDeps> = {}) {
  const runs: Array<RunRequest> = [];
  const d: RunDeps = {
    userId: () => Promise.resolve("u1"),
    isOwner: () => Promise.resolve(true),
    runRound: (request) => {
      runs.push(request);
      return Promise.resolve(report(request.collector));
    },
    ...overrides,
  };
  return { d, runs };
}

/** A POST with a bearer token and `body`. */
function post(body: unknown, token = "Bearer t"): Request {
  return new Request("http://local/run", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("handleRun", async (t) => {
  await t.step("an owner runs one check and gets its counts", async () => {
    const { d, runs } = deps();
    const response = await handleRun(
      post({ tenant_id: TENANT, collector: "group_updates" }),
      d,
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      mode: "observe",
      status: "ok",
      reason: null,
      candidates: 3,
      inserted: 1,
      cleared: 2,
      llmCalls: 4,
    });
    assertEquals(runs, [{ tenantId: TENANT, collector: "group_updates" }]);
  });

  await t.step("a signed-out caller gets 401 and nothing runs", async () => {
    const { d, runs } = deps({ userId: () => Promise.resolve(null) });
    const response = await handleRun(
      post({ tenant_id: TENANT, collector: "chat_sla" }),
      d,
    );
    assertEquals(response.status, 401);
    assertEquals(runs.length, 0);
  });

  await t.step("a member who is not an owner gets 403", async () => {
    const { d, runs } = deps({ isOwner: () => Promise.resolve(false) });
    const response = await handleRun(
      post({ tenant_id: TENANT, collector: "chat_sla" }),
      d,
    );
    assertEquals(response.status, 403);
    assertEquals(runs.length, 0);
  });

  await t.step("an unknown check or tenant id gets 400", async () => {
    const { d, runs } = deps();
    const unknown = await handleRun(
      post({ tenant_id: TENANT, collector: "self_test" }),
      d,
    );
    const badTenant = await handleRun(
      post({ tenant_id: "x", collector: "chat_sla" }),
      d,
    );
    assertEquals([unknown.status, badTenant.status], [400, 400]);
    assertEquals(runs.length, 0);
  });

  await t.step("a tenant the round skipped reports why", async () => {
    const { d } = deps({
      runRound: () =>
        Promise.resolve({
          tenants: [{ tenant_id: TENANT, mode: "observe", skipped: "locked" }],
        }),
    });
    const response = await handleRun(
      post({ tenant_id: TENANT, collector: "contact" }),
      d,
    );
    const body = await response.json();
    assertEquals([body.status, body.reason], ["skipped", "locked"]);
  });

  await t.step("a failed round call gets 502", async () => {
    const { d } = deps({
      runRound: () => Promise.reject(new Error("boom")),
    });
    const response = await handleRun(
      post({ tenant_id: TENANT, collector: "contact" }),
      d,
    );
    assertEquals(response.status, 502);
  });
});

Deno.test("RUNNABLE_COLLECTORS names real collectors", () => {
  const ids = new Set(COLLECTORS.map((collector) => collector.id));
  for (const runnable of RUNNABLE_COLLECTORS) {
    assertEquals(ids.has(runnable.id), true, runnable.id);
  }
});
