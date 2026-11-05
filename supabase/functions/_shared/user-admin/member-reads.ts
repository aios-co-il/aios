import type { DbClient } from "../supabase-clients.ts";
import {
  MemberAdminError,
  type MemberAdminStore,
  type Membership,
} from "./member-admin.ts";

/** The store's reads: users, their memberships and roles, organizations. */
export type MemberReads = Pick<
  MemberAdminStore,
  | "rolesOf"
  | "activeTenantOf"
  | "userIdByEmail"
  | "membershipOf"
  | "membershipsOf"
  | "formerRolesOf"
  | "tenantParents"
  | "activeTenantCount"
>;

/** The member-admin reads on the service-role client. */
export function memberReads(db: DbClient): MemberReads {
  return {
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
    async membershipsOf(userId) {
      const { data, error } = await db
        .from("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return data ?? [];
    },
    async formerRolesOf(tenantId, userId) {
      const { data, error } = await db
        .from("tenant_inactive_members")
        .select("member_role, roles")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data ? [data.member_role, ...data.roles] : [];
    },
    async tenantParents() {
      const { data, error } = await db
        .from("tenants")
        .select("id, parent_tenant_id");
      if (error) {
        throw error;
      }
      return new Map((data ?? []).map((t) => [t.id, t.parent_tenant_id]));
    },
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
