import type { DbClient } from "../supabase-clients.ts";
import {
  MemberAdminError,
  type MemberAdminStore,
  type Membership,
} from "./member-admin.ts";
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
    async rolesOf(userId) {
      const { data, error } = await db
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return data ?? [];
    },
    async activeTenantOf(userId) {
      const { data, error } = await db.rpc("get_user_tenant_id", {
        _user_id: userId,
      });
      if (error) {
        throw error;
      }
      return data ?? null;
    },
    async userIdByEmail(email) {
      const { data, error } = await db
        .from("profiles")
        .select("id")
        .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
        .is("deleted_at", null)
        .limit(2);
      if (error) {
        throw error;
      }
      if ((data ?? []).length > 1) {
        throw new MemberAdminError(409, `More than one user has ${email}`);
      }
      return data?.[0]?.id ?? null;
    },
    membershipOf: (tenantId, userId) => membershipOf(db, tenantId, userId),
    async activeTenantCount(userId) {
      const { count, error } = await db
        .from("tenant_users")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return count ?? 0;
    },
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

/** Active (tenant_users), inactive or deleted (tenant_inactive_members), or none. */
async function membershipOf(
  db: DbClient,
  tenantId: string,
  userId: string,
): Promise<Membership> {
  const [member, inactive] = await Promise.all([
    db
      .from("tenant_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("tenant_inactive_members")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (member.error) {
    throw member.error;
  }
  if (inactive.error) {
    throw inactive.error;
  }
  if (member.data) {
    return "active";
  }
  if (inactive.data?.status === "inactive") {
    return "inactive";
  }
  if (inactive.data?.status === "deleted") {
    return "deleted";
  }
  return "none";
}
