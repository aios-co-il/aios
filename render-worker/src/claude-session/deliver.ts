import { rowsOf } from "../jobs/rows.ts";
import type { SupabaseRest } from "../supabaseRest.ts";
import type { SendToCloudSession } from "./cli.ts";

/** The columns of a claimed claude_session_messages row the worker reads. */
type ClaimedMessage = {
  id?: string;
  cloud_session_id?: string;
  prompt?: string | null;
};

/**
 * Claims one queued follow-up and sends it. The row ends as sent or failed, with the prompt
 * cleared; the edge function that queued it is waiting for that verdict. Returns false when
 * the queue was empty.
 */
export async function deliverNext({
  db,
  workerId,
  send,
  log = () => {},
}: {
  db: Pick<SupabaseRest, "rpc" | "update">;
  workerId: string;
  send: SendToCloudSession;
  log?: (line: string) => void;
}): Promise<boolean> {
  const [message] = rowsOf<ClaimedMessage>(
    await db.rpc("claim_claude_session_message", { p_worker: workerId }),
  );
  if (!message?.id) {
    return false;
  }

  const failure = await sendFailure(message, send);
  log(`${message.id} ${failure ? `failed: ${failure}` : "sent"}`);
  await db.update(
    "claude_session_messages",
    `id=eq.${encodeURIComponent(message.id)}&status=eq.sending`,
    {
      status: failure ? "failed" : "sent",
      error: failure,
      prompt: null,
      finished_at: new Date().toISOString(),
    },
  );
  return true;
}

/** Why the message was not sent, or null when it was. */
async function sendFailure(
  message: ClaimedMessage,
  send: SendToCloudSession,
): Promise<string | null> {
  if (!message.cloud_session_id || !message.prompt) {
    return "the row has no session or no prompt";
  }
  try {
    await send({
      sessionId: message.cloud_session_id,
      prompt: message.prompt,
    });
    return null;
  } catch (error) {
    return (error instanceof Error ? error.message : String(error)).slice(
      0,
      500,
    );
  }
}
