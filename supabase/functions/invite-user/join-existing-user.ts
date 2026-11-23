import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/** Profile and permission reads and writes for an existing user, injectable for tests. */
export interface ExistingUserStore {
  /** Whether the user is a member of any tenant other than this one. */
  belongsToOtherTenant: (userId: string, tenantId: string) => Promise<boolean>;
  /** Creates a pending profile only when the user has none; an existing row is kept. */
  ensureProfile: (userId: string, email: string) => Promise<void>;
  /** Sets the name only when the profile has none. */
  fillMissingName: (userId: string, fullName: string) => Promise<void>;
  /** Writes the profile's single campaigner / sales person link. */
  setTeamLinks: (userId: string, links: TeamLinks) => Promise<void>;
  /** Replaces all of the user's module permissions. */
  replacePermissions: (userId: string, modules: Array<string>) => Promise<void>;
  /** Grants modules the user lacks; existing permissions are kept. */
  addPermissions: (userId: string, modules: Array<string>) => Promise<void>;
}

/** The profile's team card links; an absent key is left unchanged. */
export interface TeamLinks {
  campaigner_id?: string;
  sales_person_id?: string;
}

/**
 * Adds an existing user to a tenant without overwriting what their other
 * tenants rely on. profiles.status, full_name, campaigner_id, sales_person_id
 * and user_permissions are shared by every tenant the user is in, so a user
 * who is already in another tenant keeps them; only the new tenant's own
 * rows (role, membership, team card) are written by the caller.
 */
export async function joinExistingUser(
  store: ExistingUserStore,
  options: {
    userId: string;
    email: string;
    tenantId: string;
    fullName: string | undefined;
    teamLinks: TeamLinks;
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

  if (!inOtherTenant && Object.keys(options.teamLinks).length > 0) {
    await store.setTeamLinks(userId, options.teamLinks);
  }

  const modules = options.modulePermissions ?? [];
  if (modules.length === 0) {
    return;
  }
  // user_permissions has no tenant_id, so replacing them would wipe the
  // user's access in their other tenants.
  if (inOtherTenant) {
    await store.addPermissions(userId, modules);
  } else {
    await store.replacePermissions(userId, modules);
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
      if (error) {
        throw new Error(`Loading memberships failed: ${error.message}`);
      }
      return (data ?? []).length > 0;
    },
    async ensureProfile(userId, email) {
      const { error } = await db
        .from("profiles")
        .upsert(
          { id: userId, email, status: "pending" },
          { onConflict: "id", ignoreDuplicates: true },
        );
      if (error) {
        throw new Error(`Creating the profile failed: ${error.message}`);
      }
    },
    async fillMissingName(userId, fullName) {
      const { error } = await db
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", userId)
        .or("full_name.is.null,full_name.eq.");
      if (error) {
        throw new Error(`Setting the name failed: ${error.message}`);
      }
    },
    async setTeamLinks(userId, links) {
      const { error } = await db
        .from("profiles")
        .update(links)
        .eq("id", userId);
      if (error) {
        throw new Error(`Linking the team card failed: ${error.message}`);
      }
    },
    async replacePermissions(userId, modules) {
      const { error: deleteError } = await db
        .from("user_permissions")
        .delete()
        .eq("user_id", userId);
      if (deleteError) {
        throw new Error(`Clearing permissions failed: ${deleteError.message}`);
      }
      await insertPermissions(db, userId, modules, false);
    },
    async addPermissions(userId, modules) {
      await insertPermissions(db, userId, modules, true);
    },
  };
}

/** Inserts can_access rows; with keepExisting, a module already granted is left as is. */
async function insertPermissions(
  db: ReturnType<typeof createClient>,
  userId: string,
  modules: Array<string>,
  keepExisting: boolean,
): Promise<void> {
  const { error } = await db.from("user_permissions").upsert(
    modules.map((module) => ({ user_id: userId, module, can_access: true })),
    { onConflict: "user_id,module", ignoreDuplicates: keepExisting },
  );
  if (error) {
    throw new Error(`Granting permissions failed: ${error.message}`);
  }
}
