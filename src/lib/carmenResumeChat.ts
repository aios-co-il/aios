/**
 * The chat open in Carmen's session panel, kept for this browser tab so that
 * closing and reopening the panel returns to it. Carmen keeps working while
 * the panel is closed; closedAt lets the header button show that she has
 * answered since. sessionStorage: it never outlives the tab.
 */
const KEY = "aios:carmen-resume-chat";

export type ResumeChat = {
  tenantId: string;
  conversationId: string;
  /** Set when the panel closes; cleared when it opens on this chat again. */
  closedAt?: string;
};

export function readResumeChat(tenantId?: string | null): ResumeChat | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!raw?.conversationId || !raw?.tenantId) return null;
    if (tenantId && raw.tenantId !== tenantId) return null;
    return raw as ResumeChat;
  } catch {
    return null;
  }
}

/** Remembers the panel's current chat, or forgets it on a new chat (null). */
export function writeResumeChat(
  tenantId: string,
  conversationId: string | null,
): void {
  try {
    if (!conversationId) sessionStorage.removeItem(KEY);
    else
      sessionStorage.setItem(KEY, JSON.stringify({ tenantId, conversationId }));
  } catch {
    /* storage blocked: the panel just opens fresh */
  }
}

/** Marks the remembered chat as closed now. */
export function markResumeChatClosed(): void {
  const chat = readResumeChat();
  if (!chat) return;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...chat, closedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

/** A "streaming" turn older than this is treated as over (the server stopped). */
export const STALE_TURN_MS = 10 * 60_000;

/** A "streaming" turn silent for longer than STALE_TURN_MS. */
export function isStaleTurn(
  status: string | null | undefined,
  updatedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (status !== "streaming" || !updatedAt) return false;
  return now - Date.parse(updatedAt) > STALE_TURN_MS;
}

/** The topic status to trust: a long-silent "streaming" turn no longer counts. */
export function liveTopicStatus(
  status: string | null | undefined,
  updatedAt: string | null | undefined,
  now = Date.now(),
): string | null | undefined {
  return isStaleTurn(status, updatedAt, now) ? "idle" : status;
}
