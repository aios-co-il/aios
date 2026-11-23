import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { throwIf } from "../_shared/manager-round/db-error.ts";

/** Profile and permission writes for an existing user, injectable for tests. */
export interface ExistingUserStore {
  /** Whether the user is a member of any tenant other than this one. */
  belongsToOtherTenant: (userId: string, tenantId: string) => Promise<boolean>;
  /** Creates a pending profile only when the user has none; an existing row is kept. */
  ensureProfile: (userId: string, email: string) => Promise<void>;
  /** Sets the name only when the profile has none. */
  fillMissingName: (userId: string, fullName: string) => Promise<void>;
  /** Writes the profile's single campaigner / sales person link. */
  setTeamLinks: (userId: string, links: TeamLinks) => Promise<void>;
  /** Grants the modules; with keepOthers false, other modules are revoked. */
  grantPermissions: (
    userId: string,
    modules: Array<string>,
    keepOthers: boolean,
  ) => Promise<void>;
}

/** The profile's team card links; an absent key is left unchanged. */
type TeamLinks = { campaigner_id?: string; sales_person_id?: string };

/**
 * Adds an existing user to a tenant without overwriting what their other
 * tenants rely on. profiles.status, full_name, campaigner_id, sales_person_id
 * and user_permissions are shared by every tenant the user is in, so a user
 * who is already in another tenant keeps them; the caller writes only the new
 * tenant's own rows (role, membership, team card).
 */
export async function joinExistingUser(
  store: ExistingUserStore,
  options: {
    userId: string;
    email: string;
    tenantId: string;
    fullName: string | undefined;
    campaignerId: string | undefined;
    salesPersonId: string | undefined;
    modulePermissions: Array<string> | undefined;
  },
): Promise<void> {
  const { userId } = options;
  const inOtherTenant = await store.belongsToOtherTenant(
    userId,
    options.tenantId,
  );

  await store.ensureProfile(userId, options.email);
  if (options.fullName) {
    await store.fillMissingName(userId, options.fullName);
  }

  const links: TeamLinks = {
    ...(options.campaignerId && { campaigner_id: options.campaignerId }),
    ...(options.salesPersonId && { sales_person_id: options.salesPersonId }),
  };
  if (!inOtherTenant && Object.keys(links).length > 0) {
    await store.setTeamLinks(userId, links);
  }

  // user_permissions has no tenant_id, so revoking modules would remove the
  // user's access in their other tenants.
  if (options.modulePermissions?.length) {
    await store.grantPermissions(
      userId,
      options.modulePermissions,
      inOtherTenant,
    );
  }
}

/** The Supabase-backed store; every write is keyed by the user id. */
export function supabaseExistingUserStore(
  db: ReturnType<typeof createClient>,
): ExistingUserStore {
  return {
    async belongsToOtherTenant(userId, tenantId) {
      const { data, error } = await db
        .from("tenant_users")
        .select("id")
        .eq("user_id", userId)
        .neq("tenant_id", tenantId)
        .limit(1);
      throwIf(error, "Loading memberships failed");
      return (data ?? []).length > 0;
    },
    async ensureProfile(userId, email) {
      const { error } = await db
        .from("profiles")
        .upsert(
          { id: userId, email, status: "pending" },
          { onConflict: "id", ignoreDuplicates: true },
        );
      throwIf(error, "Creating the profile failed");
    },
    async fillMissingName(userId, fullName) {
      const { error } = await db
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", userId)
        .or("full_name.is.null,full_name.eq.");
      throwIf(error, "Setting the name failed");
    },
    async setTeamLinks(userId, links) {
      const { error } = await db
        .from("profiles")
        .update(links)
        .eq("id", userId);
      throwIf(error, "Linking the team card failed");
    },
    // Grants before revoking, so a failed step never leaves the user with
    // no permissions at all.
    async grantPermissions(userId, modules, keepOthers) {
      const { error } = await db.from("user_permissions").upsert(
        modules.map((module) => ({
          user_id: userId,
          module,
          can_access: true,
        })),
        { onConflict: "user_id,module", ignoreDuplicates: keepOthers },
      );
      throwIf(error, "Granting permissions failed");
      if (keepOthers) {
        return;
      }

      const { data, error: readError } = await db
        .from("user_permissions")
        .select("module")
        .eq("user_id", userId);
      throwIf(readError, "Loading permissions failed");
      const others = (data ?? [])
        .map((row: { module: string }) => row.module)
        .filter((module: string) => !modules.includes(module));
      if (others.length === 0) {
        return;
      }

      const { error: revokeError } = await db
        .from("user_permissions")
        .delete()
        .eq("user_id", userId)
        .in("module", others);
      throwIf(revokeError, "Revoking permissions failed");
    },
  };
}
