import type { Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { callerLabel, notifyTeam, type SendAlert } from "./recipients.ts";
import { loadCall, recordCallEnd } from "./calls.ts";
import { claimSummarySend, releaseSummaryClaim } from "./summary-claim.ts";

/** The parts of ElevenLabs' post_call_transcription webhook this handler reads. */
export type PostCallPayload = {
  type?: string;
  data?: {
    conversation_id?: string;
    transcript?: Array<{ role?: string; message?: string | null }>;
    analysis?: { transcript_summary?: string | null };
    metadata?: { call_duration_secs?: number };
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
    };
  };
};

const SUMMARY_UNDELIVERED = "summary reached no team member";

/**
 * Records a finished call and sends its summary to the team once. Other webhook types, and calls
 * that were never set up (a number no org owns), are ignored; a call over the hourly limit sends
 * no summary. A summary that reaches nobody is recorded on the call (summary_error) and its claim
 * released, so a redelivered webhook sends it again.
 */
export async function handlePostCall(
  db: DbClient,
  sendAlert: SendAlert,
  payload: PostCallPayload,
): Promise<void> {
  if (payload.type !== "post_call_transcription" || !payload.data) {
    return;
  }
  const data = payload.data;
  const callId =
    data.conversation_initiation_client_data?.dynamic_variables?.call_id;
  const call = typeof callId === "string" ? await loadCall(db, callId) : null;
  if (!call) {
    console.warn("[carmen-phone] post-call for an unknown call", {
      conversation: data.conversation_id,
    });
    return;
  }
  const transcript: Json = (data.transcript ?? [])
    .filter((t) => t.message)
    .map((t) => ({ role: t.role ?? "", message: t.message ?? "" }));
  const summary = data.analysis?.transcript_summary?.trim() || null;
  await recordCallEnd(db, call, {
    transcript,
    summary,
    conversationId: data.conversation_id ?? null,
  });
  if (call.rateLimited) {
    console.warn("[carmen-phone] no summary for a rate-limited call", {
      tenantId: call.tenantId,
      callId: call.id,
    });
    return;
  }
  if (!(await claimSummarySend(db, call))) {
    return;
  }
  const minutes = Math.max(
    1,
    Math.round((data.metadata?.call_duration_secs ?? 0) / 60),
  );
  const delivered = await notifyTeam(
    db,
    sendAlert,
    call,
    [
      `📞 סיכום שיחה של כרמן עם ${callerLabel(call)} (כ-${minutes} דק׳)`,
      "",
      summary ?? "לא התקבל סיכום לשיחה.",
      ...(call.messages.length > 0
        ? ["", `הודעות שנרשמו בשיחה: ${call.messages.length}`]
        : []),
    ].join("\n"),
  );
  if (delivered === 0) {
    // Answered 200 all the same: ElevenLabs disables a webhook that keeps failing.
    await releaseSummaryClaim(db, call, SUMMARY_UNDELIVERED);
  }
}
