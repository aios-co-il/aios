// Writes an incoming PBX event to call_logs.
import type { TablesInsert, TablesUpdate } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { PbxEvent, PbxSettings } from "../_shared/telephony/types.ts";
import { callerUpgrade, loadFirstTenantUser, resolveCaller } from "./caller.ts";
import type { CallLogRow, Owner } from "./match.ts";
import { mapCallStatus } from "./status.ts";

/** A PBX link (url) or a file we stored in call-recordings (path). */
export type Recording = { url: string | null; path: string | null };
export type SavedCall = Owner & { callLogId: string };

/** Applies a later PBX event to the call's existing call_logs row (tenant-keyed). */
export async function updateCall(
  sb: DbClient,
  tenantId: string,
  existing: CallLogRow,
  event: PbxEvent,
  owner: Owner,
  recording: Recording,
  settings: PbxSettings,
): Promise<SavedCall> {
  const { error } = await sb
    .from("call_logs")
    .update(callUpdate(existing, event, owner, recording, settings))
    .eq("id", existing.id)
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return {
    callLogId: existing.id,
    leadId: existing.lead_id ?? owner.leadId,
    clientId: existing.client_id ?? owner.clientId,
  };
}

/** Inserts the call_logs row for a call the PBX reports first, choosing its caller. */
export async function insertCall(
  sb: DbClient,
  tenantId: string,
  settings: PbxSettings,
  event: PbxEvent,
  owner: Owner,
  recording: Recording,
): Promise<SavedCall> {
  const caller = await resolveCaller(settings, event.extension, () =>
    loadFirstTenantUser(sb, tenantId),
  );
  const row: TablesInsert<"call_logs"> = {
    tenant_id: tenantId,
    lead_id: owner.leadId,
    client_id: owner.clientId,
    caller_user_id: caller.userId,
    caller_resolution: caller.resolution,
    from_number: event.caller,
    to_number: event.called || event.caller || "unknown",
    status: resolveStatus(event, recording, null),
    duration: event.duration ?? 0,
    provider: "pbx",
    provider_call_id: event.callId,
    notes: buildNotes(event, settings),
    ...recordingColumns(event, recording),
  };
  const { data, error } = await sb
    .from("call_logs")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return { callLogId: data.id, ...owner };
}

/**
 * The columns an event changes on the call it continues; a call nobody was
 * named for takes the agent its extension names (callerUpgrade).
 */
export function callUpdate(
  existing: CallLogRow,
  event: PbxEvent,
  owner: Owner,
  recording: Recording,
  settings: PbxSettings,
): TablesUpdate<"call_logs"> {
  const update: TablesUpdate<"call_logs"> = {
    status: resolveStatus(event, recording, existing),
    ...recordingColumns(event, recording),
    ...callerUpgrade(settings, event.extension, existing.caller_resolution),
  };
  if (!existing.lead_id && owner.leadId) {
    update.lead_id = owner.leadId;
  }
  if (!existing.client_id && owner.clientId) {
    update.client_id = owner.clientId;
  }
  if (event.duration !== null) {
    update.duration = event.duration;
  }
  return update;
}

function hasRecording(recording: Recording): boolean {
  return !!(recording.url || recording.path);
}

function recordingColumns(event: PbxEvent, recording: Recording) {
  if (!hasRecording(recording)) return {};
  return {
    recording_url: recording.url,
    recording_path: recording.path,
    ...(event.duration !== null && { recording_duration: event.duration }),
  };
}

function resolveStatus(
  event: PbxEvent,
  recording: Recording,
  existing: CallLogRow | null,
): string {
  if (event.status) return mapCallStatus(event.status);
  if (hasRecording(recording)) return "completed";
  return existing?.status ?? "completed";
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
