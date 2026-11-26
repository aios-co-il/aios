import type {
  BrainRoute,
  ConversationChannelStatus,
} from "@/lib/agentChannelRouting";
import { BRAIN } from "@/lib/carmenBrainAccess";

/** A stored brain pick and the org it belongs to. */
export interface OrgBrainPick {
  tenantId: string | null;
  /** The stored slug; null when the user picked nothing. */
  slug: string | null;
}

/** The user chose a brain in this sidecar, in this org, and its write has not settled. */
interface OwnPick {
  tenantId: string | null;
  ownPick: true;
}

/**
 * What a sidecar session does with the user's stored pick:
 * - a stored pick: the session follows it, and a quiet chat moves when the row
 *   holds another one;
 * - null: it follows none yet (the session just opened, or a reopened
 *   conversation runs on its own brain), so the next quiet chat opens on the
 *   stored pick;
 * - an own pick: the brain the user chose here stays on screen whatever the
 *   row reads meanwhile and whether the write is stored or refused. Once the
 *   picks have settled, the session follows what the row then holds.
 */
export type FollowedPick = OrgBrainPick | OwnPick | null;

/** What is on screen and running in a sidecar's chat. */
interface ChatActivity {
  messageCount: number;
  conversationId: string | null;
  /** A reply is streaming in. */
  streaming: boolean;
  /** A live voice conversation is open. */
  liveVoice: boolean;
  /** A voice note is being recorded or transcribed. */
  voiceNote: boolean;
  channelStatus: ConversationChannelStatus;
}

interface PickStepInput {
  /** The user's brain list and their stored picks are both known. */
  ready: boolean;
  /** No write or read of the picks is under way. */
  settled: boolean;
  /** The chat is idle and empty (isQuietChat). */
  quiet: boolean;
  stored: OrgBrainPick;
  followed: FollowedPick;
}

/**
 * What the session does with the stored pick now: "open" moves the chat to it
 * and follows it, "follow" follows it and leaves the chat where it is, "wait"
 * does neither. Only a quiet chat moves, so a pick made on another device
 * never clears a conversation in progress: it waits for the next new chat.
 */
export function pickStep({
  ready,
  settled,
  quiet,
  stored,
  followed,
}: PickStepInput): "open" | "follow" | "wait" {
  if (isOwnPick(followed) && followed.tenantId === stored.tenantId) {
    return settled ? "follow" : "wait";
  }
  if (!ready || !quiet) {
    return "wait";
  }

  return follows(followed, stored) ? "wait" : "open";
}

/**
 * Whether the chat has nothing in it and nothing running. Switching brain
 * clears the chat on screen, so only such a chat moves to the stored pick. A
 * voice note counts as running: it is sent to the brain it was started on.
 */
export function isQuietChat({
  messageCount,
  conversationId,
  streaming,
  liveVoice,
  voiceNote,
  channelStatus,
}: ChatActivity): boolean {
  return (
    messageCount === 0 &&
    !conversationId &&
    !streaming &&
    !liveVoice &&
    !voiceNote &&
    channelStatus === "idle"
  );
}

/**
 * The brain an empty chat opens on: the stored pick when the user may use it,
 * else Carmen's internal brain, else undefined to keep the current selection
 * (a user granted neither keeps the first brain they may use).
 */
export function desiredRoute(
  routes: Array<BrainRoute>,
  storedSlug: string | null,
): BrainRoute | undefined {
  const picked = storedSlug
    ? routes.find((route) => route.slug === storedSlug)
    : undefined;
  return picked ?? routes.find((route) => route.slug === BRAIN.internal);
}

/** Whether the session is holding a brain the user chose in this sidecar. */
function isOwnPick(followed: FollowedPick): followed is OwnPick {
  return followed !== null && "ownPick" in followed;
}

/** Whether the session already follows exactly this stored pick. */
function follows(followed: FollowedPick, stored: OrgBrainPick): boolean {
  return (
    followed !== null &&
    !isOwnPick(followed) &&
    followed.tenantId === stored.tenantId &&
    followed.slug === stored.slug
  );
}
