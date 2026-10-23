import { supabase } from "@/integrations/supabase/client";
import {
  CARMEN_NAME_FILTER,
  carmenEnabledFor,
  toAccessRow,
  type BrainAccessRow,
} from "@/lib/carmenBrainAccess";

/**
 * Owners who may use the ORG OpenAI key. Everyone else gets access by adding
 * a personal API key (user_api_keys) in their profile — bring-your-own-key.
 * Mirrored server-side in the carmen voice edge functions.
 */
export const COMMAND_CENTER_ALLOWLIST = ["david.castelnuovo@gmail.com"];

/** The tenant's Carmen, resolved like the edge functions' resolveCarmenAgent. */
export async function fetchCarmenAgentId(
  tenantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("tenant_id", tenantId)
    .or(CARMEN_NAME_FILTER)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** A user's permissions row for the tenant's Carmen, or null (unrestricted). */
export async function fetchCarmenAccessRow(
  tenantId: string,
  userId: string,
): Promise<BrainAccessRow> {
  const agentId = await fetchCarmenAgentId(tenantId);
  if (!agentId) return null;
  const { data } = await supabase
    .from("carmen_command_center_access")
    .select("enabled, brain_access")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .eq("user_id", userId)
    .maybeSingle();
  return toAccessRow(data);
}

/**
 * May this user open Carmen? With "view as", answers for the viewed user: the
 * permissions row decides, then the owner allowlist, then whether they have a
 * personal API key (asked through a manager-only RPC; the key stays private).
 */
export async function resolveCommandCenterAccess(
  tenantId: string | null,
  viewAsUserId: string | null,
): Promise<boolean> {
  if (viewAsUserId) {
    const [row, { data: prof }] = await Promise.all([
      tenantId ? fetchCarmenAccessRow(tenantId, viewAsUserId) : null,
      supabase
        .from("profiles")
        .select("email")
        .eq("id", viewAsUserId)
        .maybeSingle(),
    ]);
    if (row) return carmenEnabledFor(row);
    if (
      COMMAND_CENTER_ALLOWLIST.includes(String(prof?.email ?? "").toLowerCase())
    )
      return true;
    const { data: hasKey } = await supabase.rpc(
      "carmen_member_has_personal_key",
      { p_user_id: viewAsUserId },
    );
    return hasKey === true;
  }
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  if (COMMAND_CENTER_ALLOWLIST.includes(email)) return true;
  // A permissions row set in Carmen settings → הרשאות decides first.
  const uid = data.user?.id;
  if (uid && tenantId) {
    const row = await fetchCarmenAccessRow(tenantId, uid);
    if (row) return carmenEnabledFor(row);
  }
  // Any user with a personal key gets in (RLS: own row only).
  const { data: keyRow } = await supabase
    .from("user_api_keys")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  return !!keyRow;
}
