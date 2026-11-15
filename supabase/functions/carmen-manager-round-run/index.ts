/**
 * carmen-manager-round-run (AIO-597): an owner runs one manager-round check
 * now from the settings screen. See handler.ts.
 */
import { userClient } from "../_shared/supabase-clients.ts";
import { handleRun, type RunDeps } from "./handler.ts";

Deno.serve((req) => handleRun(req, liveDeps()));

/** The signed-in user, the owner check as that user, and the round over the service key. */
function liveDeps(): RunDeps {
  return {
    async userId(authorization) {
      const { data, error } = await userClient(authorization).auth.getUser();
      if (error) {
        console.warn("[carmen-manager-round-run] auth failed", error.message);
      }
      return data.user?.id ?? null;
    },
    async isOwner(authorization, tenantId) {
      const { data, error } = await userClient(authorization).rpc(
        "carmen_manager_is_owner",
        { p_tenant_id: tenantId },
      );
      if (error) {
        console.error("[carmen-manager-round-run] owner check failed", error);
        return false;
      }
      return data === true;
    },
    async runRound(request) {
      const response = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/carmen-manager-round`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenant_id: request.tenantId,
            collectors: [request.collector],
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`carmen-manager-round answered ${response.status}`);
      }
      return await response.json();
    },
  };
}
