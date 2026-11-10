import {
  type CallerKind,
  callerPolicyFor,
} from "../_shared/carmen/caller-policy/policy.ts";
import { loadOrgBrief } from "../_shared/carmen/org-brief/brief.ts";
import {
  loadPronunciations,
  pronunciationLines,
} from "../_shared/carmen/pronunciations/dictionary.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { identifyCaller } from "./caller.ts";
import { callSetup } from "./instructions.ts";
import { insertCall } from "./calls.ts";
import { callerOverLimit } from "./limits.ts";
import { findPhoneLine, loadPolicyRows, orgName } from "./store.ts";

/** What ElevenLabs sends when a call to the agent starts. */
export type InitiationPayload = {
  caller_id?: string | null;
  called_number?: string | null;
  conversation_id?: string | null;
};

/** The conversation_initiation_client_data reply: variables for the tools, and the call's prompt. */
export type InitiationReply = {
  type: "conversation_initiation_client_data";
  dynamic_variables: { call_id: string; caller_kind: string };
  conversation_config_override: {
    agent: {
      prompt: { prompt: string };
      first_message: string;
      language: "he";
    };
  };
};

const NOT_CONFIGURED_PROMPT =
  "המספר הזה עוד לא מחובר לארגון. אמרי בנימוס שהמספר אינו זמין כרגע וסיימי את השיחה. אל תמסרי שום מידע.";

/**
 * Sets up an incoming call: the org of the dialled number, who is calling, and the instructions
 * for that caller. A number that belongs to no org gets a short refusal and no call row. A caller
 * over the hourly limit is still answered, but the call is marked so it takes no messages and
 * sends no summary.
 */
export async function initiateCall(
  db: DbClient,
  payload: InitiationPayload,
): Promise<InitiationReply> {
  const line = await findPhoneLine(db, payload.called_number ?? null);
  if (!line) {
    console.warn("[carmen-phone] call to a number no org owns", {
      called: payload.called_number,
    });
    return reply(
      "",
      "unknown",
      NOT_CONFIGURED_PROMPT,
      "שלום, המספר אינו זמין כרגע.",
    );
  }
  const caller = await identifyCaller(
    db,
    line.tenantId,
    payload.caller_id ?? null,
  );
  const isStaff = caller.kind === "staff";
  const [rateLimited, name, policyRows, brief, pronunciations] =
    await Promise.all([
      callerOverLimit(db, line.tenantId, caller.phone),
      orgName(db, line.tenantId),
      isStaff ? Promise.resolve([]) : loadPolicyRows(db, line.tenantId),
      isStaff ? loadOrgBrief(db, line.tenantId) : Promise.resolve(null),
      loadPronunciations(db, line.tenantId),
    ]);
  if (rateLimited) {
    console.warn("[carmen-phone] caller over the hourly call limit", {
      tenantId: line.tenantId,
      callerKind: caller.kind,
    });
  }
  const setup = callSetup({
    orgName: name,
    caller,
    policy: isStaff
      ? null
      : callerPolicyFor(caller.kind as CallerKind, policyRows),
    brief,
    pronunciations: pronunciationLines(pronunciations),
  });
  const callId = await insertCall(
    db,
    line,
    caller,
    payload.conversation_id ?? null,
    rateLimited,
  );
  return reply(callId, caller.kind, setup.prompt, setup.firstMessage);
}

/** The reply in the shape ElevenLabs expects. */
function reply(
  callId: string,
  callerKind: string,
  prompt: string,
  firstMessage: string,
): InitiationReply {
  return {
    type: "conversation_initiation_client_data",
    dynamic_variables: { call_id: callId, caller_kind: callerKind },
    conversation_config_override: {
      agent: {
        prompt: { prompt },
        first_message: firstMessage,
        language: "he",
      },
    },
  };
}
