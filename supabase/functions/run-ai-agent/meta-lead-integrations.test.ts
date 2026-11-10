import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import { metaLeadIntegrations } from "./meta-lead-integrations.ts";

Deno.test(
  "invalid Meta integrations are isolated without hiding database failures",
  async (t) => {
    await t.step(
      "one malformed own row does not hide valid integrations or other tenants",
      async () => {
        const { db } = setup([
          row("bad", { form_mappings: { form: { agency_id: 123 } } }),
          row("bad-root", "legacy"),
          row("good", { pages: [{ id: "page", access_token: "fixture" }] }),
          { ...row("foreign", {}), tenant_id: "other-tenant" },
        ]);
        assertEquals(
          (await metaLeadIntegrations(db, "tenant-1")).map(
            (integration) => integration.id,
          ),
          ["good"],
        );
      },
    );

    await t.step(
      "invalid shared settings skip only their consumer and valid shares keep the consumer id",
      async () => {
        const { db } = setup([
          {
            ...row("bad-share", {}),
            api_key: null,
            shared_from_integration_id: "bad-source",
          },
          {
            ...row("good-share", {}),
            api_key: null,
            shared_from_integration_id: "good-source",
          },
          row("direct", { pages: [] }),
          {
            ...row("bad-source", { form_mappings: [] }),
            tenant_id: "source-tenant",
          },
          { ...row("good-source", { pages: [] }), tenant_id: "source-tenant" },
        ]);
        assertEquals(
          (await metaLeadIntegrations(db, "tenant-1")).map((integration) => ({
            id: integration.id,
            api_key: integration.api_key,
          })),
          [
            { id: "good-share", api_key: "good-source-key" },
            { id: "direct", api_key: "direct-key" },
          ],
        );
      },
    );

    await t.step("database read errors still propagate", async () => {
      const { db } = setup([], { tenant_integrations: "Read failed" });
      const failure = await metaLeadIntegrations(db, "tenant-1").catch(
        (error: unknown) => error,
      );
      assertEquals(failure, { message: "Read failed", code: "XX000" });
    });
  },
);

/** A stored integration in the current tenant, before any configured sharing. */
function row(id: string, settings: unknown): IntegrationFixture {
  return {
    id,
    settings,
    tenant_id: "tenant-1",
    api_key: `${id}-key`,
    shared_from_integration_id: null,
    integration_type: "facebook_lead_ads",
    is_active: true,
  };
}

/** Run the actual generated client against filtered in-memory database responses. */
function setup(
  rows: Array<IntegrationFixture>,
  failing?: Record<string, string>,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: "https://supabase.test",
    tables: { tenant_integrations: rows },
    failing,
  });
  const db = createClient<Database>("https://supabase.test", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: http.fetch },
  });
  return { db, calls: http.calls };
}

type IntegrationFixture = Pick<
  Database["public"]["Tables"]["tenant_integrations"]["Row"],
  | "id"
  | "tenant_id"
  | "api_key"
  | "shared_from_integration_id"
  | "integration_type"
  | "is_active"
> & { settings: unknown };
