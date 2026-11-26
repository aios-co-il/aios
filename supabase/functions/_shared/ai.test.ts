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
      const posts: Array<{ url: string; body: unknown }> = [];
      globalThis.fetch = (input, init) => {
        posts.push({
          url: new URL(input instanceof Request ? input.url : input).href,
          body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
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
        const costs: Array<number> = [];
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

Deno.test("aiDiarizeTranscribe", async (t) => {
  await t.step("logs the Scribe usage priced by audio length", async () => {
    const restoreEnv = setEnv({ ...ENV, ELEVENLABS_API_KEY: "xi-test" });
    const realFetch = globalThis.fetch;
    const posts: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input).href;
      posts.push({
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      return Promise.resolve(
        Response.json({
          words: [
            { text: "שלום", start: 0, end: 900, speaker_id: "speaker_0" },
            { text: " דני", start: 1700, end: 1800, speaker_id: "speaker_1" },
          ],
        }),
      );
    };
    try {
      const { aiDiarizeTranscribe } = await import("./ai.ts");

      const segments = await aiDiarizeTranscribe(new Blob(["audio"]));

      const log = posts.find((post) => post.url.endsWith("/ai_usage_log"));
      assertEquals(segments?.length, 2);
      assertEquals(log?.body, {
        source: "aiDiarizeTranscribe",
        model: "scribe_v2",
        cost_usd: 0.1,
        meta: { bytes: 5, seconds: 1800, estimated: true },
      });
    } finally {
      globalThis.fetch = realFetch;
      restoreEnv();
    }
  });
});

/** Sets environment variables; the returned function restores the old values. */
function setEnv(values: Record<string, string>): () => void {
  const old: Array<[string, string | undefined]> = Object.keys(values).map(
    (key) => [key, Deno.env.get(key)],
  );
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
