// A client's WhatsApp group shows Carmen's every reply to the client, even
// when a staff member asked (AIO-349). The note tells her to answer within
// what that client may see, and to present the work positively.
import type { DbClient } from "../supabase-clients.ts";

/** The note added to a turn in a client's group. */
export function clientGroupAudienceNote(clientName: string): string {
  return [
    "",
    "",
    `[קהל התשובה] זו קבוצת הלקוח ${clientName}, והלקוח רואה כל מה שתכתבי כאן, גם כשאיש צוות שואל.`,
    `עני רק במידע שמותר להראות ללקוח, ורק על ${clientName}: בלי הערות פנימיות, תקשורת צוות, נתונים כספיים פנימיים, לקוחות אחרים או דיוני הנהלה.`,
    "הציגי את העבודה תמיד באור חיובי ומקצועי. גם כשיש ירידה, למשל בלידים, תארי מה נעשה ומה הצעד הבא, לדוגמה: «ביצענו עבודת אופטימיזציה ואנחנו על זה».",
    "שאלה פנימית שאסור לענות עליה כאן: הציעי לאיש הצוות להמשיך בפרטי.",
  ].join("\n");
}

/** Who the note names when the lookup fails: the turn is treated as a client's group. */
export const UNKNOWN_GROUP_CLIENT = "הלקוח";

/**
 * The names of the clients whose group this chat is, in the tenant; null for
 * a staff group or an unregistered group. A failed lookup is logged and fails
 * safe: the turn is answered as in a client's group.
 */
export async function findGroupClientName(
  db: Pick<DbClient, "from" | "rpc">,
  input: { tenantId: string; chatId: string },
): Promise<string | null> {
  const { data: group, error: groupError } = await db
    .from("whatsapp_groups")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("group_chat_id", input.chatId)
    .limit(1)
    .maybeSingle();
  if (groupError) {
    console.error("[carmen] group lookup for audience failed", groupError);
    return UNKNOWN_GROUP_CLIENT;
  }
  if (!group) {
    return null;
  }
  // The one rule of which clients a group belongs to (AIO-242).
  const { data: links, error: linkError } = await db.rpc(
    "whatsapp_group_client_ids",
    { p_group: group.id },
  );
  if (linkError) {
    console.error("[carmen] group client links failed", linkError);
    return UNKNOWN_GROUP_CLIENT;
  }
  const clientIds = (links ?? []).filter(
    (id): id is string => typeof id === "string",
  );
  if (clientIds.length === 0) {
    return null;
  }
  const { data: clients, error: clientError } = await db
    .from("clients")
    .select("name")
    .in("id", clientIds);
  if (clientError) {
    console.error("[carmen] client names for audience failed", clientError);
    return UNKNOWN_GROUP_CLIENT;
  }
  const names = (clients ?? []).map((client) => client.name).filter(Boolean);
  return names.length ? names.join(" / ") : UNKNOWN_GROUP_CLIENT;
}
