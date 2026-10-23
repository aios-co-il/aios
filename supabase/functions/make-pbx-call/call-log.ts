// call_logs writes for calls started from the CRM.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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
    .insert({
      tenant_id: call.tenantId,
      lead_id: call.leadId,
      client_id: call.clientId,
      caller_user_id: call.userId,
      from_number: call.callerNumber,
      to_number: call.toNumber,
      status: "initiated",
      provider: "pbx",
      provider_call_id: call.callId,
      notes: call.extension ? `שלוחה ${call.extension}` : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
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
