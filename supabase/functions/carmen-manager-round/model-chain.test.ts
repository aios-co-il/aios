import { assertEquals } from "jsr:@std/assert@1";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { loadChain, loadTarget, type ModelTarget } from "./model-chain.ts";

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

Deno.test("loadTarget", async (t) => {
  const keys = {
    settings: { google_api_key: "g-key", openai_api_key: "o-key" },
  };
  const db = fakeDb({ tenant_integrations: keys });
  /** Carmen's lookup, answering an agent on `engine`. */
  function carmenOn(engine: string) {
    return () => Promise.resolve({ engine });
  }

  await t.step("Carmen's engine with the tenant's own key for it", async () => {
    assertEquals(
      await loadTarget(db, "t1", carmenOn("gemini-3.5-flash")),
      GEMINI,
    );
  });

  await t.step("a Claude engine runs without JSON mode", async () => {
    const withAnthropic = fakeDb({
      tenant_integrations: { settings: { anthropic_api_key: "a-key" } },
    });
    const target = await loadTarget(
      withAnthropic,
      "t1",
      carmenOn("claude-sonnet-4-6"),
    );
    assertEquals(target?.jsonMode, false);
  });

  await t.step("no key for the engine's provider: no target", async () => {
    assertEquals(
      await loadTarget(db, "t1", carmenOn("claude-sonnet-4-6")),
      null,
    );
  });

  await t.step(
    "no Carmen agent: no target, never a default model",
    async () => {
      assertEquals(
        await loadTarget(db, "t1", () => Promise.resolve(null)),
        null,
      );
    },
  );

  await t.step("a Manus engine is not a chat model: no target", async () => {
    assertEquals(await loadTarget(db, "t1", carmenOn("manus/manus-1")), null);
  });
});

Deno.test("loadChain", async (t) => {
  const db = fakeDb({
    tenant_integrations: { settings: { google_api_key: "g-key" } },
  });
  /** Carmen on Gemini 3.5 Flash. */
  function carmen() {
    return Promise.resolve({ engine: "gemini-3.5-flash" });
  }

  await t.step(
    "a failed OpenRouter read keeps Carmen's own engine",
    async () => {
      const chain = await loadChain(db, "t1", {
        findAgent: carmen,
        readTail: () => Promise.reject(new Error("routes read failed")),
      });
      assertEquals(chain, [GEMINI]);
    },
  );

  await t.step("the OpenRouter link follows Carmen's engine", async () => {
    const chain = await loadChain(db, "t1", {
      findAgent: carmen,
      readTail: () =>
        Promise.resolve([
          {
            url: "https://openrouter.ai/api/v1/chat/completions",
            key: "or-key",
            model: "openrouter/auto",
            label: "openrouter",
            provider: "openai" as const,
            connectionId: "c1",
          },
        ]),
    });
    assertEquals(
      chain.map((target) => target.model),
      ["gemini-3.5-flash", "openrouter/auto"],
    );
  });
});
