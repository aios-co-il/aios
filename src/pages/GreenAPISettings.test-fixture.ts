import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const state: {
  tenantId: string | null;
  loading: boolean;
  existing: boolean;
  failWrite: boolean;
  requests: Array<{
    method: string;
    path: string;
    query: string;
    body: string;
  }>;
} = {
  tenantId: "tenant-1",
  loading: false,
  existing: false,
  failWrite: false,
  requests: [],
};

/** Record the real SDK's HTTP boundary without contacting a provider or database. */
async function fetchSettings(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  state.requests.push({
    method: request.method,
    path: url.pathname,
    query: url.search,
    body: await request.text(),
  });
  if (url.pathname === "/functions/v1/configure-green-api") {
    return Response.json({ success: true });
  }
  if (url.pathname === "/rest/v1/tenant_integrations") {
    if (request.method !== "GET") {
      return state.failWrite
        ? Response.json({ message: "save rejected" }, { status: 400 })
        : new Response(null, { status: 201 });
    }
    return Response.json(
      state.existing
        ? {
            id: "integration-1",
            is_active: true,
            instance_id: "saved-instance",
            api_key: "saved-token",
            settings: { instance_id: "saved-instance" },
          }
        : null,
    );
  }
  if (
    url.pathname === "/rest/v1/integration_user_permissions" ||
    url.pathname === "/rest/v1/tenant_users"
  ) {
    return Response.json([]);
  }
  throw new Error(`Unexpected test request: ${request.method} ${url.pathname}`);
}

export const client = createClient<Database>(
  "https://green-settings.test",
  "test-key",
  {
    global: { fetch: fetchSettings },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

/** Keep assertion selection limited to externally effective save operations. */
export function saveRequests() {
  return state.requests.filter((request) => request.method !== "GET");
}
