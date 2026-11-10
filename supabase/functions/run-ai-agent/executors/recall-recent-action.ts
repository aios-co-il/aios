import type { RecallRecentActionArgs } from "./memory-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing recall_recent_action executor and side-effect order. */
export async function executeRecallRecentAction(
  args: RecallRecentActionArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  // Check if Carmen already performed an action recently — used before heavy
  // operations (pulse_check, campaign_analysis, lead_review) so she doesn't
  // re-run the same work and can answer "I already did it at HH:MM".
  const action = String(args.action_type || "").trim();
  const maxHours = Math.max(1, Math.min(168, Number(args.max_age_hours) || 8));
  const since = new Date(Date.now() - maxHours * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("carmen_memory_episodes")
    .select("id, topic, topic_tags, summary, importance, ref_date, created_at")
    .eq("tenant_id", tenantId)
    .gte("ref_date", since)
    .order("ref_date", { ascending: false })
    .limit(3);
  if (action) {
    q = q.or(`topic.ilike.%${action}%,topic_tags.cs.{${action}}`);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  /** Retains the original fmtIl helper. */
  function fmtIl(iso: string | null) {
    return iso
      ? new Date(iso).toLocaleString("he-IL", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jerusalem",
        })
      : null;
  }
  return {
    found: data.length > 0,
    recent_episodes: data.map((e) => ({
      id: e.id,
      topic: e.topic,
      topic_tags: e.topic_tags,
      summary: e.summary,
      when_israel: fmtIl(e.ref_date || e.created_at),
      importance: e.importance,
    })),
    guidance:
      data.length > 0
        ? 'יש פעולה דומה שנעשתה לאחרונה. אסור לחזור עליה מחדש אלא אם המשתמש ביקש "רענני" / "עכשיו" / "בזמן אמת". ענו עם הסיכום הקיים, ציינו את הזמן, ושאלו אם לרענן.'
        : "אין רישום מ-N השעות האחרונות. אפשר להריץ את הפעולה.",
  };
}
