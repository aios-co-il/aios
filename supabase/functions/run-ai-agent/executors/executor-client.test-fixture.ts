import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Answers one intercepted request; `undefined` falls back to an empty list. */
export type ExecutorRoute = (url: URL, method: string) => unknown;

/** Uses the real query builder and intercepts HTTP without external writes.
 * `responses` answers requests in order, or by URL when it is a function. */
export function executorClient(
  responses: Array<unknown> | ExecutorRoute,
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
          const response =
            typeof responses === "function"
              ? (responses(new URL(request.url), request.method) ?? [])
              : responses.shift();
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

/** A campaigner caller: assertCallerCanAccessClient checks client_team. */
export const CAMPAIGNER_SCOPE: Partial<ToolExecutionContext> = {
  callerScope: {
    callerCampaignerId: "camp1",
    isManagerRole: false,
    isTeamManager: false,
    managedAgencyIds: [],
    accessibleTenantIds: ["t1", "shared"],
  },
};

/** A full-tenant manager: assertCallerCanAccessClient lets every client through. */
export const MANAGER_SCOPE: Partial<ToolExecutionContext> = {
  isManagerRole: true,
  callerScope: {
    isManagerRole: true,
    isTeamManager: false,
    managedAgencyIds: [],
    accessibleTenantIds: ["t1", "shared"],
  },
};

/** Replaces global fetch (Graph, Google, edge functions) for one test. */
export async function withGlobalFetch<T>(
  handler: (url: URL) => unknown,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return Promise.resolve(
      new Response(JSON.stringify(handler(url)), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
