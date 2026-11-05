// The handler's dependencies in production: the service-role client's auth
// lookup, a user's roles and tenant memberships, and the admin user update.
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import type { ResetPasswordDeps } from "./handler.ts";

/** ResetPasswordDeps over the service-role client. */
export function liveResetPasswordDeps(
  admin: DbClient = serviceClient(),
): ResetPasswordDeps {
  return {
    callerId: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    rolesOf: async (userId) => {
      const { data, error } = await admin
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", userId);
      if (error) {
        throw new Error(`user_roles lookup failed: ${error.message}`);
      }
      return data;
    },
    tenantsOf: async (userId) => {
      const { data, error } = await admin
        .from("tenant_users")
        .select("tenant_id")
        .eq("user_id", userId);
      if (error) {
        throw new Error(`tenant_users lookup failed: ${error.message}`);
      }
      return data.map((row) => row.tenant_id);
    },
    updateUser: async (userId, update) => {
      const { error } = await admin.auth.admin.updateUserById(userId, update);
      return error ? error.message : null;
    },
  };
}
