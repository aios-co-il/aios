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
  /** The caller went over the hourly call limit: no messages, no summary. */
  rateLimited: boolean;
};

const LOG = "[carmen-phone]";

/** Opens the call's row and returns its id; a rate-limited call is marked on the row. */
export async function insertCall(
  db: DbClient,
  line: PhoneLine,
  caller: PhoneCaller,
  conversationId: string | null,
  rateLimited: boolean,
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
      rate_limited: rateLimited,
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
      "id, tenant_id, caller_kind, caller_phone, caller_name, client_ids, messages, started_at, rate_limited",
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
    rateLimited: data.rate_limited,
  };
}

/** Adds a message Carmen took to the call; false (and logged) when it was not stored. */
export async function appendMessage(
  db: DbClient,
  call: PhoneCall,
  message: Json,
): Promise<boolean> {
  const { error } = await db
    .from("carmen_phone_calls")
    .update({ messages: [...call.messages, message] })
    .eq("id", call.id)
    .eq("tenant_id", call.tenantId);
  if (error) {
    console.error(`${LOG} message not stored on the call`, {
      tenantId: call.tenantId,
      callId: call.id,
      error: error.message,
    });
    return false;
  }
  return true;
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

/** Whether a string is a UUID, so a made-up id never reaches a query. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
