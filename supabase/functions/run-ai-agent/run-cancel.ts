import type { DbClient } from "../_shared/supabase-clients.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether the user stopped this run from the chat (`carmen_run_cancellations`). Checked before
 * each model round and each tool, so a stopped request runs no further tools. Only a stop by the
 * run's own user counts; a run without a valid id or user can never be stopped. Once seen, the
 * answer stays true without another read; a failed read is logged and reads as not stopped.
 */
export function runStopCheck(
  db: Pick<DbClient, "from">,
  runId: unknown,
  userId: string | null,
): () => Promise<boolean> {
  let stopped = false;
  if (typeof runId !== "string" || !UUID.test(runId) || !userId) {
    return () => Promise.resolve(false);
  }
  return async () => {
    if (stopped) {
      return true;
    }
    const { data, error } = await db
      .from("carmen_run_cancellations")
      .select("run_id")
      .eq("run_id", runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[AGENT] run stop check failed", error.message);
      return false;
    }
    stopped = Boolean(data);
    return stopped;
  };
}

/** What Carmen says when the user stopped her: what she already did, if anything. */
export function stoppedReply(toolsRun: Array<string>): string {
  const done = [...new Set(toolsRun)];
  return done.length > 0
    ? `⏹️ עצרתי לפי בקשתך. לפני העצירה כבר הרצתי: ${done.join(", ")}.`
    : "⏹️ עצרתי לפי בקשתך. לא בוצעה שום פעולה.";
}
