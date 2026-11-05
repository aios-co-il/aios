import type { DbClient } from "../supabase-clients.ts";
import type { MemberAdminStore } from "./member-admin.ts";
import { memberReads } from "./member-reads.ts";
import { ruleRefusal } from "./rule-refusal.ts";

/** GoTrue has no permanent ban; a hundred years is the usual stand-in. */
const SIGN_IN_BLOCKED = "876000h";

/** The member-admin store on the service-role client. */
export function memberAdminStore(db: DbClient): MemberAdminStore {
  return {
    async callerFromToken(token) {
      const { data, error } = await db.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    ...memberReads(db),
    async authUserExists(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error?.status === 404) {
        return false;
      }
      if (error) {
        throw error;
      }
      return Boolean(data.user);
    },
    async offboard(tenantId, userId, actorId, status) {
      const { data, error } = await db.rpc("offboard_tenant_member", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_actor: actorId,
        p_status: status,
      });
      if (error) {
        throw ruleRefusal(error);
      }
      const row = data?.[0];
      if (!row) {
        throw new Error("offboard_tenant_member returned no row");
      }
      return {
        remainingTenants: row.remaining_tenants,
        accountDeleted: row.account_deleted,
      };
    },
    async reactivate(tenantId, userId, actorId) {
      const { error } = await db.rpc("reactivate_tenant_member", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_actor: actorId,
      });
      if (error) {
        throw ruleRefusal(error);
      }
    },
    async setSignInBlocked(userId, blocked) {
      const { error } = await db.auth.admin.updateUserById(userId, {
        ban_duration: blocked ? SIGN_IN_BLOCKED : "none",
      });
      if (error) {
        throw error;
      }
    },
    async softDeleteLogin(userId) {
      // Soft delete keeps the auth.users row, so profiles_id_fkey never cascades.
      const { error } = await db.auth.admin.deleteUser(userId, true);
      if (error) {
        throw error;
      }
    },
  };
}
