/**
 * Tenant brain keys from Carmen settings (carmen_brain_connections + Vault).
 * A built-in brain's UI key replaces its env secret for that tenant's sends;
 * without one, the project env secret is used as before.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  BUILTIN_BRAIN_KEYS,
  overlayBrainEnv,
} from "../carmen/brain-connections.ts";
import type { SendContext } from "./types.ts";
import { serviceClient } from "./store.ts";

export function projectEnv(): Record<string, string | undefined> {
  try {
    return Deno.env.toObject();
  } catch {
    return {};
  }
}

export async function connectionSecret(
  sb: SupabaseClient,
  connectionId: string,
): Promise<string> {
  const { data, error } = await sb.rpc("carmen_brain_secret_get", {
    p_connection_id: connectionId,
  });
  if (error) {
    console.error("[brain-env] secret read failed", error.message);
    return "";
  }
  return typeof data === "string" ? data : "";
}

/** Env names → values the tenant set from the UI for built-in brains. */
export async function tenantBrainOverrides(
  sb: SupabaseClient,
  tenantId: string,
): Promise<Record<string, string>> {
  const { data, error } = await sb
    .from("carmen_brain_connections")
    .select("id, slug, settings, secret_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "builtin");
  if (error || !data?.length) return {};
  const out: Record<string, string> = {};
  for (const row of data as Array<{
    id: string;
    slug: string;
    settings: Record<string, unknown> | null;
    secret_id: string | null;
  }>) {
    const spec = BUILTIN_BRAIN_KEYS.find((b) => b.slug === row.slug);
    if (!spec) continue;
    if (row.secret_id) {
      const secret = await connectionSecret(sb, row.id);
      if (secret) out[spec.secretEnv] = secret;
    }
    const externalId = String(row.settings?.external_id ?? "").trim();
    if (spec.idEnv && externalId) out[spec.idEnv] = externalId;
  }
  return out;
}

export async function loadBrainEnv(
  sb: SupabaseClient,
  tenantId: string,
): Promise<Record<string, string | undefined>> {
  return overlayBrainEnv(
    projectEnv(),
    await tenantBrainOverrides(sb, tenantId),
  );
}

/** The env a launcher should read for this send. */
export async function sendEnv(
  ctx: SendContext,
): Promise<Record<string, string | undefined>> {
  if (!ctx.env) ctx.env = await loadBrainEnv(serviceClient(), ctx.tenantId);
  return ctx.env;
}
