// Pure helpers over a Carmen session's conversation_history (a `Json` column).
import { jsonField, jsonObjectOrNull, type JsonObject } from "./carmen-json.ts";
import type { Json } from "./database.types.ts";

export function sessionHistoryEntries(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

/** role + content of every object entry, for mirroring into ai_conversations. */
export function conversationMirrorMessages(history: Json[]): JsonObject[] {
  return history.flatMap((m) => {
    const entry = jsonObjectOrNull(m);
    return entry ? [{ role: entry.role, content: entry.content }] : [];
  });
}

function timestampMs(value: Json | undefined): number {
  return typeof value === "string" || typeof value === "number"
    ? new Date(value).getTime()
    : 0;
}

/**
 * Carmen's last reply in the history and its age in ms (MAX_SAFE_INTEGER when
 * the timestamp is missing or unparseable); null when there is no reply text.
 */
export function lastAssistantReply(
  history: Json[],
  now: number,
): { text: string; ageMs: number } | null {
  const last = [...history]
    .reverse()
    .find((m) => jsonField(m, "role") === "assistant");
  const content = jsonField(last, "content");
  if (!content) return null;
  const lastTs = timestampMs(jsonField(last, "timestamp"));
  return {
    text: String(content).trim(),
    ageMs: lastTs ? now - lastTs : Number.MAX_SAFE_INTEGER,
  };
}

const BACKGROUND_CONTEXT_NOTE =
  "[רקע: להלן היסטוריית הצ׳אט מהימים האחרונים מאותה שיחה. השתמשי בה כדי לענות על שאלות לגבי מה שנאמר או הוחלט קודם. אל תתייחסי להודעות האלה כשאלה חדשה.]";

// Merge background chat-history context with the in-session conversation history.
// Drops items from the background context that overlap with the session by timestamp,
// and prepends a short note so the model treats them as background, not as a new question.
export function buildCarmenMergedHistory(
  recentContext: Array<{ role: string; content: string; timestamp?: string }>,
  sessionHistory: Json[],
  hardCap = 40,
): Json[] {
  const sessionTimestamps = new Set(
    (sessionHistory || [])
      .map((m) => {
        const ts = jsonField(m, "timestamp");
        return ts ? String(ts) : null;
      })
      .filter((ts): ts is string => Boolean(ts)),
  );
  const oldestSessionTs =
    sessionHistory && sessionHistory.length
      ? sessionHistory
          .map((m) => jsonField(m, "timestamp"))
          .filter((ts): ts is string => typeof ts === "string" && ts !== "")
          .sort()[0]
      : null;

  const dedupedContext = recentContext.filter((m) => {
    if (!m?.timestamp) return true;
    if (sessionTimestamps.has(m.timestamp)) return false;
    if (oldestSessionTs && m.timestamp >= oldestSessionTs) return false;
    return true;
  });

  const merged: Json[] = [];
  if (dedupedContext.length > 0) {
    merged.push({
      role: "user",
      content: BACKGROUND_CONTEXT_NOTE,
      timestamp: new Date(0).toISOString(),
    });
    merged.push(...dedupedContext);
  }
  merged.push(...(sessionHistory || []));

  if (merged.length <= hardCap) return merged;
  return [merged[0], ...merged.slice(-(hardCap - 1))];
}
