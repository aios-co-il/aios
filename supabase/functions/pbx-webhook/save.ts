// Writes an incoming PBX event to call_logs.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { mapCallStatus } from "../_shared/pbx/status.ts";
import type { PbxEvent, PbxSettings } from "../_shared/pbx/types.ts";
import { WebhookError } from "./errors.ts";
import type { CallLogRow, Owner } from "./match.ts";

export interface SavedCall extends Owner {
  callLogId: string;
}

function resolveStatus(
  event: PbxEvent,
  recordingUrl: string | null,
  existing: CallLogRow | null,
): string {
  if (event.status) return mapCallStatus(event.status);
  if (recordingUrl) return "completed";
  return existing?.status ?? "completed";
}

export async function updateCall(
  sb: SupabaseClient,
  existing: CallLogRow,
  event: PbxEvent,
  owner: Owner,
  recordingUrl: string | null,
): Promise<SavedCall> {
  const update: Record<string, unknown> = {
    status: resolveStatus(event, recordingUrl, existing),
  };
  if (!existing.lead_id && owner.leadId) update.lead_id = owner.leadId;
  if (!existing.client_id && owner.clientId) update.client_id = owner.clientId;
  if (event.duration !== null) update.duration = event.duration;
  if (recordingUrl) {
    update.recording_url = recordingUrl;
    if (event.duration !== null) update.recording_duration = event.duration;
  }
  const { error } = await sb
    .from("call_logs")
    .update(update)
    .eq("id", existing.id);
  if (error) throw error;
  return {
    callLogId: existing.id,
    leadId: (update.lead_id as string) ?? existing.lead_id,
    clientId: (update.client_id as string) ?? existing.client_id,
  };
}

/** The agent on the extension, else the tenant's first user
 *  (call_logs.caller_user_id is required). */
async function resolveCallerUser(
  sb: SupabaseClient,
  tenantId: string,
  settings: PbxSettings,
  extension: string | null,
): Promise<string> {
  const mapped = extension
    ? (settings.extensions || []).find((e) => e.extension === extension)
    : undefined;
  if (mapped?.user_id) return mapped.user_id;
  const { data } = await sb
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.user_id) throw new WebhookError("No tenant user found", 422);
  return data.user_id;
}

function buildNotes(event: PbxEvent, settings: PbxSettings): string | null {
  const direction =
    event.direction === "inbound"
      ? "שיחה נכנסת"
      : event.direction === "outbound"
        ? "שיחה יוצאת"
        : null;
  const parts = [
    direction,
    event.extension ? `שלוחה ${event.extension}` : null,
    settings.name ? `מרכזיה: ${settings.name}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
}

export async function insertCall(
  sb: SupabaseClient,
  tenantId: string,
  settings: PbxSettings,
  event: PbxEvent,
  owner: Owner,
  recordingUrl: string | null,
): Promise<SavedCall> {
  const callerUserId = await resolveCallerUser(
    sb,
    tenantId,
    settings,
    event.extension,
  );
  const { data, error } = await sb
    .from("call_logs")
    .insert({
      tenant_id: tenantId,
      lead_id: owner.leadId,
      client_id: owner.clientId,
      caller_user_id: callerUserId,
      from_number: event.caller,
      to_number: event.called || event.caller || "unknown",
      status: resolveStatus(event, recordingUrl, null),
      duration: event.duration ?? 0,
      recording_url: recordingUrl,
      recording_duration: recordingUrl ? event.duration : null,
      provider: "pbx",
      provider_call_id: event.callId,
      notes: buildNotes(event, settings),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { callLogId: data.id, ...owner };
}
