/**
 * Carmen's reply as a voice note too, when the message she answered was one
 * (best-effort; the text reply has already gone). The note leaves from the
 * line that received the message (AIO-654), so the receiving line is passed
 * explicitly and send-manus-wa-voice never picks another one.
 */
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The line that received the message. */
export type ReceivingLine = {
  tenantId: string;
  integrationId: string | null | undefined;
};

/** Sends a voice note to a chat; true when it was sent. */
export type VoiceSender = (chatId: string, text: string) => Promise<boolean>;

/**
 * A sender bound to the receiving line. Without the line's id it sends
 * nothing and logs; a failed call is logged and answers false.
 */
export function makeVoiceSender(
  sb: Pick<DbClient, "functions">,
  line: ReceivingLine,
): VoiceSender {
  return async (chatId, text) => {
    if (!line.integrationId) {
      console.error(
        `[manus-wa voice] no voice note: the receiving line of tenant ${line.tenantId} is unknown (text reply was sent)`,
      );
      return false;
    }

    const { error } = await sb.functions.invoke("send-manus-wa-voice", {
      body: {
        tenant_id: line.tenantId,
        integration_id: line.integrationId,
        to: chatId,
        text,
      },
    });
    if (error) {
      console.error(
        `[manus-wa voice] voice note not sent from line ${line.integrationId} (text reply was sent): ${error.message}`,
      );
      return false;
    }

    return true;
  };
}
