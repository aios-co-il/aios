import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executorClient } from "../executors/executor-client.test-fixture.ts";
import { resolveLLMTarget } from "./target.ts";
import { resolveOpenAiAdminKey } from "./billing-key.ts";
import { buildLLMChain } from "./chain.ts";

Deno.test(
  "LLM key readers validate stored values and report lookup errors",
  async (t) => {
    const previous = [
      Deno.env.get("OPENAI_ADMIN_KEY"),
      Deno.env.get("OPENAI_ADMIN_API_KEY"),
    ];
    Deno.env.delete("OPENAI_ADMIN_KEY");
    Deno.env.delete("OPENAI_ADMIN_API_KEY");
    try {
      await t.step(
        "provider keys accept strings and reject malformed JSON values",
        async () => {
          for (const value of [42, true, {}, [], "", "   "]) {
            const fixture = executorClient([
              { settings: { openai_api_key: value } },
            ]);
            await assertRejects(
              () =>
                resolveLLMTarget(
                  fixture.context.supabase,
                  "t1",
                  "openai/gpt-4o",
                ),
              Error,
              "OpenAI (GPT)",
            );
          }

          const fixture = executorClient([
            { settings: { google_api_key: "valid" } },
          ]);
          const result = await resolveLLMTarget(
            fixture.context.supabase,
            "t1",
            "google/gemini-test",
          );
          assertEquals(result.key, "valid");
          assertEquals(result.model, "gemini-test");
        },
      );

      await t.step(
        "admin keys reject coercion and keep stored alias precedence",
        async () => {
          for (const value of [42, true, {}, [], "", "   "]) {
            const fixture = executorClient([
              { settings: { openai_admin_api_key: value } },
            ]);
            assertEquals(
              await resolveOpenAiAdminKey(fixture.context.supabase, "t1"),
              { key: null, source: null },
            );
          }

          const fixture = executorClient([
            { settings: { openai_admin_key: " alias " } },
          ]);
          assertEquals(
            await resolveOpenAiAdminKey(fixture.context.supabase, "t1"),
            { key: "alias", source: "tenant_integrations.llm.settings" },
          );
        },
      );

      await t.step("query errors are distinct from missing keys", async () => {
        const provider = executorClient(
          [{ message: "private database detail" }],
          500,
        );
        await assertRejects(
          () =>
            resolveLLMTarget(provider.context.supabase, "t1", "openai/gpt-4o"),
          Error,
          "LLM key lookup failed",
        );

        const admin = executorClient(
          [{ message: "private database detail" }],
          500,
        );
        await assertRejects(
          () => resolveOpenAiAdminKey(admin.context.supabase, "t1"),
          Error,
          "OpenAI admin key lookup failed",
        );
      });

      await t.step(
        "provider failures are logged without exposing stored secrets",
        async () => {
          const logs: Array<Array<unknown>> = [];
          const original = console.warn;
          console.warn = (...args) => {
            logs.push(args);
          };
          try {
            const fixture = executorClient(
              Array(3).fill({ message: "secret-database-detail" }),
              500,
            );
            assertEquals(
              await buildLLMChain(
                fixture.context.supabase,
                "t1",
                "google/gemini-3-flash-preview",
              ),
              [],
            );
            assertEquals(logs.length, 3);
            assertEquals(
              JSON.stringify(logs).includes("secret-database-detail"),
              false,
            );
          } finally {
            console.warn = original;
          }
        },
      );
    } finally {
      for (const [index, name] of [
        "OPENAI_ADMIN_KEY",
        "OPENAI_ADMIN_API_KEY",
      ].entries()) {
        const value = previous[index];
        if (value === undefined) {
          Deno.env.delete(name);
        } else {
          Deno.env.set(name, value);
        }
      }
    }
  },
);
