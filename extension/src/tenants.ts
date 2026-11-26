import { supabase } from "./supabase";

export interface TenantOption {
  id: string;
  name: string;
  slug: string | null;
}

/** The organizations the signed-in user belongs to, by name. */
export async function loadTenants(): Promise<Array<TenantOption>> {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, tenants(id, name, slug)");
  if (error) {
    throw error;
  }
  const seen = new Set<string>();
  const result: Array<TenantOption> = [];
  for (const row of data ?? []) {
    const t = row.tenants;
    if (isTenantOption(t) && !seen.has(t.id)) {
      seen.add(t.id);
      result.push(t);
    }
  }
  return result.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "he"),
  );
}

/** Narrows a joined `tenants` value, which is null when the user cannot read that organization. */
function isTenantOption(value: unknown): value is TenantOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "slug" in value &&
    (value.slug === null || typeof value.slug === "string")
  );
}

/**
 * The org the user is ACTIVE on in the web app (user_active_tenant), then the one last
 * picked here: with multiple orgs, an arbitrary default causes RLS clashes with the SPA.
 */
export async function preferredTenant(
  tenants: Array<TenantOption>,
): Promise<TenantOption | null> {
  const { data: activeRow, error } = await supabase
    .from("user_active_tenant")
    .select("tenant_id")
    .maybeSingle();
  if (error) {
    console.error("preferredTenant:", error);
  }
  const { lastTenantId } = await chrome.storage.local.get("lastTenantId");

  return (
    tenants.find((t) => t.id === activeRow?.tenant_id) ??
    tenants.find((t) => t.id === lastTenantId) ??
    (tenants.length === 1 ? tenants[0] : null)
  );
}
