import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import { callerUpgrade, loadFirstTenantUser, resolveCaller } from "./caller.ts";
import { WebhookError } from "./errors.ts";

const settings = { extensions: [{ extension: "101", user_id: "dana" }] };

Deno.test("resolveCaller", async (t) => {
  await t.step("a mapped extension names its agent", async () => {
    const fallback = () => Promise.reject(new Error("not asked"));
    assertEquals(await resolveCaller(settings, "101", fallback), {
      userId: "dana",
      resolution: "extension",
    });
  });

  await t.step(
    "an unknown or missing extension falls back and says so",
    async () => {
      const fallback = () => Promise.resolve("first-user");
      assertEquals(await resolveCaller(settings, "999", fallback), {
        userId: "first-user",
        resolution: "fallback",
      });
      assertEquals(await resolveCaller({}, null, fallback), {
        userId: "first-user",
        resolution: "fallback",
      });
    },
  );

  await t.step("a tenant without users is refused", async () => {
    await assertRejects(
      () => resolveCaller({}, "101", () => Promise.resolve(null)),
      WebhookError,
      "No tenant user found",
    );
  });
});

Deno.test("callerUpgrade", async (t) => {
  await t.step(
    "a call nobody was named for takes the mapped extension's agent",
    () => {
      const named = { caller_user_id: "dana", caller_resolution: "extension" };
      assertEquals(callerUpgrade(settings, "101", null), named);
      assertEquals(callerUpgrade(settings, "101", "fallback"), named);
    },
  );

  await t.step(
    "a named caller stays, and an unmapped extension changes nothing",
    () => {
      assertEquals(callerUpgrade(settings, "101", "click_to_call"), null);
      assertEquals(callerUpgrade(settings, "101", "extension"), null);
      assertEquals(callerUpgrade(settings, "999", "fallback"), null);
      assertEquals(callerUpgrade(settings, null, null), null);
    },
  );
});

Deno.test("loadFirstTenantUser", async (t) => {
  /** A client whose tenant_users read answers `rows`, or fails when `failing`. */
  const client = (rows: Record<string, unknown>[], failing = false) => {
    const http = fakeSupabaseHttp({
      supabaseUrl: "http://db.test",
      tables: { tenant_users: rows },
      failing: failing ? { tenant_users: "boom" } : {},
    });
    return createClient<Database>("http://db.test", "key", {
      global: { fetch: http.fetch },
    });
  };

  await t.step("the webhook tenant's user, else null", async () => {
    const rows = [
      { tenant_id: "t2", user_id: "other" },
      { tenant_id: "t1", user_id: "first-user" },
    ];
    assertEquals(await loadFirstTenantUser(client(rows), "t1"), "first-user");
    assertEquals(await loadFirstTenantUser(client(rows), "t3"), null);
  });

  await t.step(
    "a failed read throws, so the webhook answers 500 instead of 'No tenant user found'",
    async () => {
      await assertRejects(() => loadFirstTenantUser(client([], true), "t1"));
    },
  );
});
