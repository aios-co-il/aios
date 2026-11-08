import {
  isExplicitDevTaskApproval,
  isExplicitDevTaskDecline,
} from "../../_shared/dev-task-approval-words.ts";
import { parseApprovalReply } from "../approvals/reply.ts";
import { INSTRUCTION_TRIGGER_RE } from "../instruction-trigger.ts";

/**
 * Where a fast answer may go: a signed-in user's AIOS chat (streamed), or a team member's private
 * WhatsApp chat with Carmen. Groups, clients and unknown senders never take the fast lane.
 */
export type FastLaneChannel = "app_chat" | "whatsapp_staff";

/** What decides whether a chat turn may try the fast lane. */
export type FastLaneTurn = {
  message: string;
  /** Null when the turn comes from anywhere else. */
  channel: FastLaneChannel | null;
  isCarmen: boolean;
  /** Anything that pins the run to a model, skills or a special flow. */
  pinned: boolean;
};

// A long message is usually a brief or a pasted document; the full brain handles it.
const MAX_FAST_MESSAGE_CHARS = 600;

/**
 * Whether a quick model may answer this turn before Carmen's full setup (memory, skills, tools).
 * It may only answer; anything else goes to the full brain. Turns that the full path reads in
 * code are never sent to it: a yes or no to an approval or a dev task, and a standing instruction.
 */
export function fastLaneFits(turn: FastLaneTurn): boolean {
  const message = turn.message.trim();
  if (
    !turn.channel ||
    !turn.isCarmen ||
    turn.pinned ||
    message.length === 0 ||
    message.length > MAX_FAST_MESSAGE_CHARS
  ) {
    return false;
  }
  const approval = parseApprovalReply(message);
  return !(
    approval.approve ||
    approval.reject ||
    isExplicitDevTaskApproval(message) ||
    isExplicitDevTaskDecline(message) ||
    INSTRUCTION_TRIGGER_RE.test(message)
  );
}
