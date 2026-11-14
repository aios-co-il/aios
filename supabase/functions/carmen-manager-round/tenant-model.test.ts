import { assertEquals } from "jsr:@std/assert@1";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { ModelTarget } from "./model-chain.ts";
import { type TenantModelDeps, tenantModelAsker } from "./tenant-model.ts";

type Rows = { tenant_integrations?: unknown };

/** A db whose every chained read of a table resolves to that table's row. */
function fakeDb(rows: Rows): DbClient {
  function query(table: keyof Rows) {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "or", "order", "limit"]) {
      chain[name] = () => chain;
    }
    chain.maybeSingle = () =>
      Promise.resolve({ data: rows[table] ?? null, error: null });
    return chain;
  }
  return { from: query } as unknown as DbClient;
}

const GEMINI: ModelTarget = {
  url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  key: "g-key",
  model: "gemini-3.5-flash",
  jsonMode: true,
};

/** Deps over a scripted fetch that records each request. */
function deps(
  targets: Array<ModelTarget>,
  reply: (call: number) => Promise<Response>,
) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const logged: Array<Record<string, unknown>> = [];
  let lookups = 0;
  const d: TenantModelDeps = {
    targets: () => {
      lookups += 1;
      return Promise.resolve(targets);
    },
    fetch: (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return reply(requests.length - 1);
    },
    log: (row) => {
      logged.push(row);
    },
  };
  return { d, requests, logged, lookups: () => lookups };
}

/** A reply with `content` and token usage. */
function ok(content: string): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      ),
    );
}

Deno.test("tenantModelAsker", async (t) => {
  await t.step(
    "a JSON call on Carmen's brain, logged under the tenant",
    async () => {
      const { d, requests, logged } = deps([GEMINI], ok('{"material":false}'));
      const ask = tenantModelAsker(
        fakeDb({}),
        "t1",
        { source: "s", timeoutMs: 1_000 },
        d,
      );
      assertEquals((await ask("p")).text, '{"material":false}');
      assertEquals(requests[0].url, GEMINI.url);
      assertEquals(requests[0].body.model, "gemini-3.5-flash");
      assertEquals(requests[0].body.response_format, { type: "json_object" });
      assertEquals([logged[0].tenant_id, logged[0].source], ["t1", "s"]);
    },
  );

  await t.step(
    "a target without JSON mode sends no response_format",
    async () => {
      const claude: ModelTarget = {
        url: "https://api.anthropic.com/v1/chat/completions",
        key: "a-key",
        model: "claude-sonnet-4-6",
        jsonMode: false,
      };
      const { d, requests } = deps([claude], ok("{}"));
      const ask = tenantModelAsker(
        fakeDb({}),
        "t1",
        { source: "s", timeoutMs: 1_000 },
        d,
      );
      await ask("p");
      assertEquals("response_format" in requests[0].body, false);
    },
  );

  await t.step("without a target no call is made", async () => {
    const { d, requests } = deps([], ok("{}"));
    const ask = tenantModelAsker(
      fakeDb({}),
      "t1",
      { source: "s", timeoutMs: 1_000 },
      d,
    );
    assertEquals(await ask("p"), { text: null, costUsd: 0 });
    assertEquals(requests.length, 0);
  });

  await t.step("the target is read once per run", async () => {
    const { d, lookups } = deps([GEMINI], ok("{}"));
    const ask = tenantModelAsker(
      fakeDb({}),
      "t1",
      { source: "s", timeoutMs: 1_000 },
      d,
    );
    await ask("a");
    await ask("b");
    assertEquals(lookups(), 1);
  });

  await t.step("a refused call answers no text", async () => {
    const { d } = deps([GEMINI], () =>
      Promise.resolve(new Response("no", { status: 429 })),
    );
    const ask = tenantModelAsker(
      fakeDb({}),
      "t1",
      { source: "s", timeoutMs: 1_000 },
      d,
    );
    assertEquals(await ask("p"), { text: null, costUsd: 0 });
  });
});

Deno.test("tenantModelAsker chain", async (t) => {
  const tail: ModelTarget = {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: "or-key",
    model: "openrouter/auto",
    jsonMode: true,
  };

  await t.step("a refused link moves to the next one", async () => {
    const { d, requests } = deps([GEMINI, tail], (call) =>
      call === 0
        ? Promise.resolve(new Response("quota", { status: 429 }))
        : ok('{"ok":true}')(),
    );
    const ask = tenantModelAsker(
      fakeDb({}),
      "t1",
      { source: "s", timeoutMs: 1_000 },
      d,
    );
    assertEquals((await ask("p")).text, '{"ok":true}');
    assertEquals(
      requests.map((r) => r.url),
      [GEMINI.url, tail.url],
    );
  });

  await t.step(
    "a server error ends the call, even naming a quota",
    async () => {
      const { d, requests } = deps([GEMINI, tail], () =>
        Promise.resolve(new Response("quota exceeded", { status: 503 })),
      );
      const ask = tenantModelAsker(
        fakeDb({}),
        "t1",
        { source: "s", timeoutMs: 1_000 },
        d,
      );
      assertEquals(await ask("p"), { text: null, costUsd: 0 });
      assertEquals(requests.length, 1);
    },
  );
});
