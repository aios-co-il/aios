// Finds the call log and the lead (or client) an incoming PBX event belongs to.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { leadPhoneCandidates } from "../_shared/pbx/event.ts";
import { phoneLikePattern, phoneMatchKey } from "../_shared/pbx/phone.ts";
import type { PbxEvent } from "../_shared/pbx/types.ts";

export interface CallLogRow {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  status: string;
}
export interface Owner {
  leadId: string | null;
  clientId: string | null;
}

const RECORDING_ATTACH_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function findCallById(
  sb: SupabaseClient,
  tenantId: string,
  callId: string | null,
): Promise<CallLogRow | null> {
  if (!callId) return null;
  const { data } = await sb
    .from("call_logs")
    .select("id, lead_id, client_id, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "pbx")
    .eq("provider_call_id", callId)
    .maybeSingle();
  return data;
}

// Phones are stored in many formats ("050-123-4567", "+972 50…"), so fetch
// loose matches and confirm on the normalized digits.
async function findByPhone(
  sb: SupabaseClient,
  table: "leads" | "clients",
  tenantId: string,
  key: string,
): Promise<string | null> {
  let q = sb
    .from(table)
    .select("id, phone")
    .eq("tenant_id", tenantId)
    .ilike("phone", phoneLikePattern(key));
  if (table === "leads") q = q.order("created_at", { ascending: false });
  const { data } = await q.limit(20);
  return (data || []).find((r) => phoneMatchKey(r.phone) === key)?.id ?? null;
}

export async function findOwnerByPhone(
  sb: SupabaseClient,
  tenantId: string,
  event: PbxEvent,
): Promise<Owner> {
  for (const key of leadPhoneCandidates(event)) {
    const leadId = await findByPhone(sb, "leads", tenantId, key);
    if (leadId) return { leadId, clientId: null };
    const clientId = await findByPhone(sb, "clients", tenantId, key);
    if (clientId) return { leadId: null, clientId };
  }
  return { leadId: null, clientId: null };
}

/** The owner's latest PBX call without a recording, e.g. a call started from
 *  the CRM when the PBX does not echo call_id. */
export async function findCallAwaitingRecording(
  sb: SupabaseClient,
  tenantId: string,
  owner: Owner,
): Promise<CallLogRow | null> {
  if (!owner.leadId && !owner.clientId) return null;
  const since = new Date(Date.now() - RECORDING_ATTACH_WINDOW_MS).toISOString();
  let q = sb
    .from("call_logs")
    .select("id, lead_id, client_id, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "pbx")
    .is("recording_url", null)
    .gte("created_at", since);
  q = owner.leadId
    ? q.eq("lead_id", owner.leadId)
    : q.eq("client_id", owner.clientId!);
  const { data } = await q
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
