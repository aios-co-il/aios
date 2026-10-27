// Who made a PBX call. call_logs.caller_user_id is required, so an unknown
// extension falls back to the tenant's first user; caller_resolution records
// which one it was, so nobody is held responsible for a call they did not
// make (AIO-253: the manager round names only 'extension' and click-to-call
// callers).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { PbxSettings } from "../_shared/telephony/types.ts";
import { WebhookError } from "./errors.ts";

export type CallerResolution = "extension" | "fallback";

export type ResolvedCaller = { userId: string; resolution: CallerResolution };

/** The agent on the extension, else the fallback user from `loadFallbackUser`. */
export async function resolveCaller(
  settings: PbxSettings,
  extension: string | null,
  loadFallbackUser: () => Promise<string | null>,
): Promise<ResolvedCaller> {
  const mapped = extensionUser(settings, extension);
  if (mapped) {
    return { userId: mapped, resolution: "extension" };
  }
  const fallback = await loadFallbackUser();
  if (!fallback) {
    throw new WebhookError("No tenant user found", 422);
  }
  return { userId: fallback, resolution: "fallback" };
}

/**
 * The caller columns a later event fixes: a call nobody was named for yet
 * (NULL, or the fallback user because its first event had no extension)
 * takes the agent a mapped extension names. A named caller (extension, or
 * the person who started it from AIOS) is never replaced.
 */
export function callerUpgrade(
  settings: PbxSettings,
  extension: string | null,
  current: string | null,
): { caller_user_id: string; caller_resolution: "extension" } | null {
  const mapped = extensionUser(settings, extension);
  return mapped && (current === null || current === "fallback")
    ? { caller_user_id: mapped, caller_resolution: "extension" }
    : null;
}

/** The tenant's first user, the owner of calls no extension explains. */
export async function loadFirstTenantUser(
  sb: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.user_id ?? null;
}

/** The user mapped to the extension in the tenant's PBX settings, else null. */
function extensionUser(
  settings: PbxSettings,
  extension: string | null,
): string | null {
  const mapped = extension
    ? (settings.extensions ?? []).find((e) => e.extension === extension)
    : undefined;
  return mapped?.user_id || null;
}
