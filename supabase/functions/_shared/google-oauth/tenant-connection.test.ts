import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../testing/fake-supabase-http.ts";
import { withRuntime } from "../testing/served-handler.ts";
import {
  saveTenantConnection,
  tenantConnections,
} from "./tenant-connection.ts";
import { UserFacingError } from "./user-facing-error.ts";

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
  "a row whose settings are not an object is marked unreadable and never blocks the tenant",
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
        ["array", null],
        ["text", null],
        ["null", {}],
      ],
    );
  },
);

Deno.test("an unreadable row is never rewritten", async () => {
  await assertRejects(
    () =>
      saveTenantConnection({
        tenantId: TENANT,
        userId: "user-1",
        integrationType: "google_analytics",
        existing: {
          id: "array",
          user_id: "user-1",
          settings: null,
          updated_at: "2026-11-24T00:00:00Z",
        },
        tokens: { access_token: "a", expires_in: 3600 },
      }),
    UserFacingError,
    "cannot be read",
  );
});
