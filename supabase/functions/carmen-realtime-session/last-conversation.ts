import type { DbClient } from "../_shared/supabase-clients.ts";

/** The caller's most recent conversation with Carmen, as the voice session recalls it. */
export type LastConversation = {
  title: string;
  updatedAt: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
};

// A conversation older than this is no longer "the last one we had".
const RECALL_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_TURNS = 14;
const MAX_TURN_CHARS = 300;

/**
 * The caller's latest conversation in the tenant (voice or typed, `ai_conversations`), within
 * the last three days. Read directly, so a new call knows what was just said even before the
 * memory pipeline learns from it. Never throws: on a failed read, none.
 */
export async function loadLastConversation(
  db: DbClient,
  userId: string,
  tenantId: string,
  now: Date = new Date(),
): Promise<LastConversation | null> {
  const { data, error } = await db
    .from("ai_conversations")
    .select("title, updated_at, messages")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .gte("updated_at", new Date(now.getTime() - RECALL_WINDOW_MS).toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(
      "[carmen-realtime-session] last conversation read failed",
      error.message,
    );
    return null;
  }
  if (!data) {
    return null;
  }
  const turns = conversationTurns(data.messages);
  return turns.some((t) => t.role === "user")
    ? { title: data.title ?? "", updatedAt: data.updated_at, turns }
    : null;
}

/** The last user and assistant turns of a stored conversation, each shortened. */
export function conversationTurns(
  messages: unknown,
): LastConversation["turns"] {
  if (!Array.isArray(messages)) {
    return [];
  }
  const turns: LastConversation["turns"] = [];
  for (const m of messages) {
    const role = m?.role;
    const content = typeof m?.content === "string" ? m.content.trim() : "";
    if ((role === "user" || role === "assistant") && content) {
      const last = turns[turns.length - 1];
      // The app and the chat may store the same answer twice (streamed, then final).
      if (
        last?.role === role &&
        last.content === content.slice(0, MAX_TURN_CHARS)
      ) {
        continue;
      }
      turns.push({ role, content: content.slice(0, MAX_TURN_CHARS) });
    }
  }
  return turns.slice(-MAX_TURNS);
}

/**
 * The recall section of the voice instructions: what was said last time, and that she continues
 * from it at once when the user refers to it, without opening it on her own.
 */
export function lastConversationInstructions(
  conversation: LastConversation,
): string {
  return [
    `=== השיחה האחרונה ביניכם${conversation.title ? ` (${conversation.title})` : ""} ===`,
    ...conversation.turns.map(
      (t) => `- ${t.role === "user" ? "המשתמש" : "כרמן"}: ${t.content}`,
    ),
    'זו השיחה הקודמת. כשהמשתמש מתייחס אליה ("על מה דיברנו", "נמשיך", "מה אמרת על..."), המשיכי ממנה מיד, בלי לבדוק ובלי ask_carmen. אל תפתחי אותה מיוזמתך.',
  ].join("\n");
}
