import type { Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { PhoneCaller, PhoneCallerKind } from "./caller.ts";
import type { PhoneLine } from "./store.ts";

/** A call as the tools and the post-call webhook read it. */
export type PhoneCall = {
  id: string;
  tenantId: string;
  callerKind: PhoneCallerKind;
  callerPhone: string | null;
  callerName: string | null;
  clientIds: Array<string>;
  messages: Array<Json>;
  startedAt: string;
};

const LOG = "[carmen-phone]";

/** Opens the call's row and returns its id. */
export async function insertCall(
  db: DbClient,
  line: PhoneLine,
  caller: PhoneCaller,
  conversationId: string | null,
): Promise<string> {
  const { data, error } = await db
    .from("carmen_phone_calls")
    .insert({
      tenant_id: line.tenantId,
      line_id: line.id,
      caller_phone: caller.phone,
      caller_kind: caller.kind,
      caller_name: caller.name,
      client_ids: caller.clientIds,
      campaigner_id: caller.campaignerId,
      elevenlabs_conversation_id: conversationId,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`call row insert failed: ${error.message}`);
  }
  return data.id;
}

/** The call by id, or null for an id that names no call. */
export async function loadCall(
  db: DbClient,
  callId: string,
): Promise<PhoneCall | null> {
  if (!isUuid(callId)) {
    return null;
  }
  const { data, error } = await db
    .from("carmen_phone_calls")
    .select(
      "id, tenant_id, caller_kind, caller_phone, caller_name, client_ids, messages, started_at",
    )
    .eq("id", callId)
    .maybeSingle();
  if (error) {
    throw new Error(`call read failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return {
    id: data.id,
    tenantId: data.tenant_id,
    callerKind: data.caller_kind as PhoneCallerKind,
    callerPhone: data.caller_phone,
    callerName: data.caller_name,
    clientIds: data.client_ids,
    messages: Array.isArray(data.messages) ? data.messages : [],
    startedAt: data.started_at,
  };
}

/** Adds a message Carmen took to the call. */
export async function appendMessage(
  db: DbClient,
  call: PhoneCall,
  message: Json,
): Promise<void> {
  const { error } = await db
    .from("carmen_phone_calls")
    .update({ messages: [...call.messages, message] })
    .eq("id", call.id)
    .eq("tenant_id", call.tenantId);
  if (error) {
    console.error(`${LOG} message not stored on the call`, error.message);
  }
}

/** Stores the transcript and summary of a finished call. */
export async function recordCallEnd(
  db: DbClient,
  call: PhoneCall,
  end: {
    transcript: Json;
    summary: string | null;
    conversationId: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from("carmen_phone_calls")
    .update({
      transcript: end.transcript,
      summary: end.summary,
      ended_at: new Date().toISOString(),
      ...(end.conversationId
        ? { elevenlabs_conversation_id: end.conversationId }
        : {}),
    })
    .eq("id", call.id)
    .eq("tenant_id", call.tenantId);
  if (error) {
    throw new Error(`call end not stored: ${error.message}`);
  }
}

/**
 * Claims the right to send the call's summary: true once per call, so a retried webhook does not
 * send it twice.
 */
export async function claimSummarySend(
  db: DbClient,
  call: PhoneCall,
): Promise<boolean> {
  const { data, error } = await db
    .from("carmen_phone_calls")
    .update({ summary_sent_at: new Date().toISOString() })
    .eq("id", call.id)
    .eq("tenant_id", call.tenantId)
    .is("summary_sent_at", null)
    .select("id");
  if (error) {
    throw new Error(`summary claim failed: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/** Whether a string is a UUID, so a made-up id never reaches a query. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
