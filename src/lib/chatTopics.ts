export type TopicChat = {
  id: string;
  title?: string | null;
  updated_at: string;
  status?: string | null;
  routing_mode?: string | null;
  brain_route_id?: string | null;
};

const TOPIC_MAX = 48;

/**
 * A short topic name for a chat: the first sentence of its title (which is
 * the opening message), cut at a word boundary.
 */
export function topicTitle(title?: string | null): string {
  const first = String(title || "")
    .split(/\n|[.?!](?=\s|$)/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find(Boolean);
  if (!first) return "שיחה חדשה";
  if (first.length <= TOPIC_MAX) return first;
  const cut = first.slice(0, TOPIC_MAX);
  const space = cut.lastIndexOf(" ");
  return `${space > TOPIC_MAX / 2 ? cut.slice(0, space) : cut}…`;
}

export function topicIsLive(status?: string | null): boolean {
  return (
    status === "debating" ||
    status === "waiting_external" ||
    status === "streaming"
  );
}

export function topicModeLabel(routing?: string | null): string {
  if (routing === "parliament") return "שולחן";
  if (routing === "direct_channel") return "ישיר";
  if (routing === "internal") return "כרמן";
  return "";
}

export function lastConversationStorageKey(tenantId: string): string {
  return `aios:cc-conversation:${tenantId}`;
}

export function streamAppliesToActive(
  boundId?: string | null,
  activeId?: string | null,
): boolean {
  return !!boundId && boundId === activeId;
}

/** Only the in-flight stream of THIS chat locks send. Debating/waiting must stay typable. */
export function composerLockedForChat(args: {
  conversationId: string | null;
  liveStreamIds: string[];
  status?: string | null;
}): boolean {
  if (args.conversationId && args.liveStreamIds.includes(args.conversationId))
    return true;
  if (
    !args.conversationId &&
    args.liveStreamIds.length &&
    args.status === "streaming"
  )
    return true;
  return false;
}
