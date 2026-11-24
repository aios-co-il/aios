import { assertEquals } from "jsr:@std/assert@1";

import { isSupabaseApiHost, isSupabaseFunctionUrl } from "./hosts.ts";

Deno.test("isSupabaseApiHost", async (t) => {
  await t.step("accepts supabase.co and the api*.aios.co.il domains", () => {
    for (const host of [
      "zvoijyneresvkadpprel.supabase.co",
      "api.aios.co.il",
      "api-staging.aios.co.il",
      "API.AIOS.CO.IL",
    ]) {
      assertEquals(isSupabaseApiHost(host), true, host);
    }
  });

  await t.step("rejects other aios.co.il and look-alike hosts", () => {
    for (const host of [
      "aios.co.il",
      "staging.aios.co.il",
      "client.aios.co.il",
      "api.aios.co.il.evil.com",
      "supabase.co.evil.com",
    ]) {
      assertEquals(isSupabaseApiHost(host), false, host);
    }
  });
});

Deno.test("isSupabaseFunctionUrl", async (t) => {
  await t.step("needs a functions path", () => {
    assertEquals(
      isSupabaseFunctionUrl("https://api.aios.co.il/functions/v1/x"),
      true,
    );
    assertEquals(
      isSupabaseFunctionUrl("https://api.aios.co.il/rest/v1/x"),
      false,
    );
  });

  await t.step("accepts the configured own host", () => {
    assertEquals(
      isSupabaseFunctionUrl(
        "https://edge.example.test/functions/v1/x",
        "https://edge.example.test",
      ),
      true,
    );
    assertEquals(
      isSupabaseFunctionUrl("https://edge.example.test/functions/v1/x"),
      false,
    );
  });

  await t.step("rejects a value that is not a URL", () => {
    assertEquals(isSupabaseFunctionUrl("not a url", "also not"), false);
  });
});
