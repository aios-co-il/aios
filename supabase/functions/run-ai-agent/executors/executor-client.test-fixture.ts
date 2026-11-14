import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Uses the real query builder and intercepts HTTP without external writes. */
export function executorClient(
  responses: Array<unknown>,
  status = 200,
  overrides: Partial<ToolExecutionContext> = {},
) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const supabase = createClient<Database>(
    "https://example.supabase.co",
    "test-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const text = await request.text();
          calls.push({
            url: request.url,
            method: request.method,
            body: text ? JSON.parse(text) : null,
          });
          const response = responses.shift();
          if (response instanceof Response) {
            return response;
          }
          return new Response(JSON.stringify(response), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    },
  );
  const context: ToolExecutionContext = {
    supabase,
    name: "test",
    tenantId: "t1",
    userId: null,
    actorUserId: null,
    accessibleTenantIds: ["t1", "shared"],
    devEscalationTier: null,
    isManagerRole: false,
    isTeamManager: false,
    managedAgencyIds: [],
    bypassCampaignerScope: false,
    canManageAutomations: false,
    approval: {},
    callerScope: {
      isManagerRole: false,
      isTeamManager: false,
      managedAgencyIds: [],
      accessibleTenantIds: ["t1", "shared"],
    },
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    ...overrides,
  };
  return { calls, context };
}
