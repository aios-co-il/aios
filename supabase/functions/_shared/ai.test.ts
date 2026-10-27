import { assertEquals } from "jsr:@std/assert@1";

const ENV = {
  OPENAI_API_KEY: "sk-test",
  SUPABASE_URL: "https://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
};

Deno.test("aiChat", async (t) => {
  await t.step(
    "logs the usage under the caller's tenant and source and reports its cost",
    async () => {
      const restoreEnv = setEnv(ENV);
      const realFetch = globalThis.fetch;
      const posts: { url: string; body: unknown }[] = [];
      globalThis.fetch = (input, init) => {
        posts.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return Promise.resolve(
          Response.json({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 1_000, completion_tokens: 500 },
          }),
        );
      };
      try {
        // ai.ts reads its keys when loaded, so it is loaded after setEnv.
        const { aiChat } = await import("./ai.ts");
        const costs: number[] = [];
        const text = await aiChat("prompt", {
          jsonMode: true,
          tenantId: "tenant-1",
          source: "manager_round:chat",
          onUsage: (usage) => costs.push(usage.costUsd),
        });
        const log = posts.find((post) => post.url.endsWith("/ai_usage_log"));
        assertEquals(text, '{"ok":true}');
        assertEquals(costs, [0.00045]);
        assertEquals(log?.body, {
          source: "manager_round:chat",
          model: "gpt-4o-mini",
          tokens_in: 1_000,
          tokens_out: 500,
          cost_usd: 0.00045,
          tenant_id: "tenant-1",
        });
      } finally {
        globalThis.fetch = realFetch;
        restoreEnv();
      }
    },
  );
});

/** Sets environment variables; the returned function restores the old values. */
function setEnv(values: Record<string, string>): () => void {
  const old: [string, string | undefined][] = Object.keys(values).map((key) => [
    key,
    Deno.env.get(key),
  ]);
  for (const [key, value] of Object.entries(values)) {
    Deno.env.set(key, value);
  }
  return () => {
    for (const [key, value] of old) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  };
}
