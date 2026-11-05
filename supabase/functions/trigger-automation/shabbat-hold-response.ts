import { authorizeTenantCaller } from "../_shared/automation-run-auth.ts";
import { type DbClient, userClient } from "../_shared/supabase-clients.ts";
import { holdTaskNotificationForShabbat } from "./shabbat-hold.ts";

/**
 * trigger-automation's answer to a task notification inside the Shabbat
 * window (AIO-226), or null outside it. A peer notification is queued only
 * for a caller who passes the generic path's tenant check.
 */
export async function holdOnShabbat(
  supabase: Pick<DbClient, "from" | "auth" | "rpc">,
  requestBody: unknown,
  req: Request,
  headers: Record<string, string>,
): Promise<Response | null> {
  const hold = await holdTaskNotificationForShabbat(supabase, requestBody, {
    authorizeTenant: (tenantId) =>
      authorizeTenantCaller(
        supabase,
        userClient,
        req.headers.get("Authorization"),
        // The same service key index.ts builds its client with.
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        tenantId,
      ),
  });
  if (!hold) {
    return null;
  }
  return new Response(JSON.stringify(hold.body), {
    headers: { ...headers, "Content-Type": "application/json" },
    status: hold.status,
  });
}
