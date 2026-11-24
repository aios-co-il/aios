import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../testing/fake-supabase-http.ts";
import { withRuntime } from "../testing/served-handler.ts";
import { tenantConnections } from "./tenant-connection.ts";

const SUPABASE_URL = "https://tenant-connection.supabase.co";

const TENANT = "22222222-2222-4222-8222-222222222222";

function row(id: string, settings: unknown) {
  return {
    id,
    tenant_id: TENANT,
    integration_type: "google_analytics",
    user_id: "user-1",
    settings,
    updated_at: "2026-11-24T00:00:00Z",
  };
}

Deno.test(
  "settings that are not an object are kept aside and never block the tenant",
  async () => {
    const http = fakeSupabaseHttp({
      supabaseUrl: SUPABASE_URL,
      tables: {
        tenant_integrations: [
          row("object", { property_id: "p-1" }),
          row("encoded", JSON.stringify({ property_id: "p-2" })),
          row("array", [1, 2]),
          row("text", "not json"),
          row("null", null),
          row("encoded-null", "null"),
        ],
      },
    });

    const connections = await withRuntime(
      {
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "test-service" },
        fetch: http.fetch,
      },
      () => tenantConnections(TENANT, "google_analytics"),
    );

    assertEquals(
      connections.map(({ id, settings }) => [id, settings]),
      [
        ["object", { property_id: "p-1" }],
        ["encoded", { property_id: "p-2" }],
        ["array", { unreadable_settings: [1, 2] }],
        ["text", { unreadable_settings: "not json" }],
        ["null", {}],
        ["encoded-null", {}],
      ],
    );
  },
);
