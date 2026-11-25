import { assertEquals } from "jsr:@std/assert@1";

import { publicApiUrl, publicFunctionUrl } from "./url.ts";

/** An env reader over a fixed map. */
function envOf(values: Record<string, string>) {
  return { get: (key: string) => values[key] };
}

Deno.test("publicApiUrl", async (t) => {
  await t.step("prefers PUBLIC_API_URL and drops a trailing slash", () => {
    const env = envOf({
      PUBLIC_API_URL: "https://api.aios.co.il/",
      SUPABASE_URL: "https://ref.supabase.co",
    });

    assertEquals(publicApiUrl(env), "https://api.aios.co.il");
  });

  await t.step("falls back to SUPABASE_URL", () => {
    assertEquals(
      publicApiUrl(envOf({ SUPABASE_URL: "https://ref.supabase.co" })),
      "https://ref.supabase.co",
    );
  });

  await t.step("is empty when neither is set", () => {
    assertEquals(publicApiUrl(envOf({})), "");
  });
});

Deno.test("publicFunctionUrl appends the function path", () => {
  const env = envOf({ PUBLIC_API_URL: "https://api.aios.co.il" });

  assertEquals(
    publicFunctionUrl("carmen-mcp/mcp", env),
    "https://api.aios.co.il/functions/v1/carmen-mcp/mcp",
  );
});
