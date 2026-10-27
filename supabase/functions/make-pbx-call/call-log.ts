// call_logs writes for calls started from the CRM.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { TablesInsert } from "../_shared/database.types.ts";
import type { CallerResolution } from "../_shared/telephony/types.ts";

export interface NewOutboundCall {
  tenantId: string;
  userId: string;
  leadId: string | null;
  clientId: string | null;
  toNumber: string;
  callerNumber: string | null;
  extension: string | null;
  callId: string;
}

export async function createCallLog(sb: SupabaseClient, call: NewOutboundCall) {
  const { data, error } = await sb
    .from("call_logs")
    .insert(newCallRow(call))
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * The call_logs row of a call started from AIOS. The person who clicked made
 * it, so it is attributed to them (caller_resolution click_to_call), and
 * pbx-webhook's later events never replace them.
 */
export function newCallRow(call: NewOutboundCall): TablesInsert<"call_logs"> {
  return {
    tenant_id: call.tenantId,
    lead_id: call.leadId,
    client_id: call.clientId,
    caller_user_id: call.userId,
    caller_resolution: "click_to_call" satisfies CallerResolution,
    from_number: call.callerNumber,
    to_number: call.toNumber,
    status: "initiated",
    provider: "pbx",
    provider_call_id: call.callId,
    notes: call.extension ? `שלוחה ${call.extension}` : null,
  };
}

export async function markCallFailed(
  sb: SupabaseClient,
  log: { id: string; notes: string | null },
  detail: string,
) {
  await sb
    .from("call_logs")
    .update({
      status: "failed",
      notes: [log.notes, `המרכזיה החזירה שגיאה: ${detail}`]
        .filter(Boolean)
        .join(" | "),
    })
    .eq("id", log.id);
}
