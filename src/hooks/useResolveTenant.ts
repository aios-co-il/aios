import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a tenant slug for a user, with persistence to user_active_tenant if needed
 * Returns the slug string if found, otherwise null
 */
export async function resolveTenantSlug(
  userId: string,
  retries = 3,
): Promise<string | null> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Add small delay for subsequent retries to allow DB to settle
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }

      // 1) Try active tenant mapping first
      const { data: activeTenant, error: activeError } = await supabase
        .from("user_active_tenant")
        .select("tenant_id, tenants(slug, status)")
        .eq("user_id", userId)
        .maybeSingle();

      if (activeError) {
        console.warn(
          `Attempt ${attempt + 1}: Error fetching active tenant:`,
          activeError,
        );
      }

      const activeSlug = activeTenant?.tenants?.slug;
      if (activeSlug) {
        return activeSlug;
      }

      // 2) Fall back to first available tenant from memberships
      const { data: userTenants, error: tenantsError } = await supabase
        .from("tenant_users")
        .select("tenant_id, tenants(slug, status)")
        .eq("user_id", userId)
        .limit(10);

      if (tenantsError) {
        console.warn(
          `Attempt ${attempt + 1}: Error fetching user tenants:`,
          tenantsError,
        );
        lastError = tenantsError;
        continue;
      }

      if (!userTenants || userTenants.length === 0) {
        console.warn(`Attempt ${attempt + 1}: No tenants found for user`);
        lastError = new Error("No tenants found");
        continue;
      }

      // Prefer marketingcaptain tenant if user is a member
      const mcTenant = (userTenants || []).find(
        (t) => t?.tenants?.slug === "marketingcaptain",
      );
      const candidate =
        mcTenant ||
        (userTenants || []).find((t) => t?.tenants?.status === "active") ||
        (userTenants || [])[0];
      const candidateSlug = candidate?.tenants?.slug;
      const candidateTenantId = candidate?.tenant_id;

      if (candidateSlug && candidateTenantId) {
        // Persist as active for next time
        await supabase.from("user_active_tenant").upsert(
          {
            user_id: userId,
            tenant_id: candidateTenantId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        return candidateSlug;
      }
    } catch (err) {
      console.error(`Attempt ${attempt + 1}: resolveTenantSlug error:`, err);
      lastError = err;
    }
  }

  console.error(
    "❌ Failed to resolve tenant after all retries. Last error:",
    lastError,
  );
  return null;
}
