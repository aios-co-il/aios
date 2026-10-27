// Finds the call log and the lead (or client) an incoming PBX event belongs to.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { PbxEvent } from "../_shared/telephony/types.ts";
import { leadPhoneCandidates } from "./event.ts";

export type CallLogRow = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  status: string;
  recording_url: string | null;
  recording_path: string | null;
  caller_resolution: string | null;
};
export type Owner = { leadId: string | null; clientId: string | null };

const COLUMNS =
  "id, lead_id, client_id, status, recording_url, recording_path, caller_resolution";
// PBXs send the recording and final status minutes after the call; a later
// event for the same owner belongs to a new call.
const MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;
const OPEN_STATUSES = ["initiated", "ringing", "in-progress"];

export async function findCallById(
  sb: SupabaseClient,
  tenantId: string,
  callId: string | null,
): Promise<CallLogRow | null> {
  if (!callId) return null;
  const { data, error } = await pbxCalls(sb, tenantId)
    .eq("provider_call_id", callId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Exact match on the normalized last 9 digits (indexed in SQL). */
export async function findOwnerByPhone(
  sb: SupabaseClient,
  tenantId: string,
  event: PbxEvent,
): Promise<Owner> {
  for (const key of leadPhoneCandidates(event)) {
    const { data, error } = await sb.rpc("find_phone_owner", {
      p_tenant_id: tenantId,
      p_match_key: key,
    });
    if (error) throw error;
    const row = data?.[0];
    if (row?.lead_id) return { leadId: row.lead_id, clientId: null };
    if (row?.client_id) return { leadId: null, clientId: row.client_id };
  }
  return { leadId: null, clientId: null };
}

/** A retried webhook for a recording we already have. */
export async function findDuplicateRecording(
  sb: SupabaseClient,
  tenantId: string,
  event: PbxEvent,
  hasFile: boolean,
): Promise<CallLogRow | null> {
  if (event.recordingUrl) {
    const { data, error } = await pbxCalls(sb, tenantId)
      .eq("recording_url", event.recordingUrl)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  // Without a URL the file itself has no key; caller, called and a non-zero
  // duration make a retry recognizable (two 0 s calls are not the same call).
  if (!hasFile || !event.caller || !event.called || !event.duration)
    return null;
  const { data, error } = await recentPbxCalls(sb, tenantId)
    .eq("from_number", event.caller)
    .eq("to_number", event.called)
    .eq("duration", event.duration)
    .not("recording_path", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * The call an event without a known call_id continues: the owner's latest
 * call still open (status events) or still missing its recording.
 */
export async function findOpenCall(
  sb: SupabaseClient,
  tenantId: string,
  owner: Owner,
  event: PbxEvent,
  bringsRecording: boolean,
): Promise<CallLogRow | null> {
  let q = recentPbxCalls(sb, tenantId);
  if (owner.leadId) q = q.eq("lead_id", owner.leadId);
  else if (owner.clientId) q = q.eq("client_id", owner.clientId);
  else if (event.caller && event.called)
    q = q.eq("from_number", event.caller).eq("to_number", event.called);
  else return null;
  q = bringsRecording
    ? q.is("recording_url", null).is("recording_path", null)
    : q.in("status", OPEN_STATUSES);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function pbxCalls(sb: SupabaseClient, tenantId: string) {
  return sb
    .from("call_logs")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("provider", "pbx");
}

function recentPbxCalls(sb: SupabaseClient, tenantId: string) {
  const since = new Date(Date.now() - MATCH_WINDOW_MS).toISOString();
  return pbxCalls(sb, tenantId).gte("created_at", since);
}
