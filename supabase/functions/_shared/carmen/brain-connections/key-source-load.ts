/** Reads what key-source.ts resolves from: shares, home tenants, own rows. */
import type { SecretClient } from "./overrides.ts";

export type BuiltinRow = {
  id: string;
  tenant_id: string;
  slug: string;
  settings: unknown;
  secret_id: string | null;
};

export type Loaded = {
  /** builtin slug → the tenant sharing it into this tenant. */
  shares: Map<string, string>;
  homes: Set<string>;
  rows: BuiltinRow[];
};

/** Shares into this tenant, the home tenants among the sources, their rows. */
export async function loadSources(
  sb: SecretClient,
  tenantId: string,
): Promise<Loaded> {
  const sharesRes = await sb
    .from("carmen_brain_key_shares")
    .select("source_tenant_id, builtin_slug")
    .eq("target_tenant_id", tenantId);
  if (sharesRes.error) {
    throw new Error(`Brain key shares read failed: ${sharesRes.error.message}`);
  }
  const shares = new Map(
    (sharesRes.data ?? []).map((s) => [s.builtin_slug, s.source_tenant_id]),
  );
  const tenants = [...new Set([tenantId, ...shares.values()])];
  const [homesRes, rowsRes] = await Promise.all([
    sb
      .from("carmen_brain_home_tenants")
      .select("tenant_id")
      .in("tenant_id", tenants),
    sb
      .from("carmen_brain_connections")
      .select("id, tenant_id, slug, settings, secret_id")
      .eq("kind", "builtin")
      .in("tenant_id", tenants),
  ]);
  if (homesRes.error) {
    throw new Error(
      `Brain home tenants read failed: ${homesRes.error.message}`,
    );
  }
  if (rowsRes.error) {
    throw new Error(`Brain keys read failed: ${rowsRes.error.message}`);
  }
  return {
    shares,
    homes: new Set((homesRes.data ?? []).map((h) => h.tenant_id)),
    rows: rowsRes.data ?? [],
  };
}
