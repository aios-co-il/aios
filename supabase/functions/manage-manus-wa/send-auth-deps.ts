import type { DbClient } from "../_shared/supabase-clients.ts";
import type { ManusSendAuthDeps } from "./send-auth.ts";

/** authorizeManusSend's lookups over the service-role client; each throws when its query fails. */
export function manusSendAuthDeps(
  supabase: Pick<DbClient, "auth" | "from" | "rpc">,
): ManusSendAuthDeps {
  return {
    async getUserId(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error ? null : (data?.user?.id ?? null);
    },
    async isTenantMember(tenantId, userId) {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return !!data;
    },
    async isSuperAdmin(userId) {
      const { data, error } = await supabase.rpc("is_super_admin", {
        _user_id: userId,
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
    async tenantCanUseIntegration(tenantId, integrationId) {
      const { data, error } = await supabase.rpc("tenant_can_use_integration", {
        p_tenant_id: tenantId,
        p_integration_id: integrationId,
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
  };
}
