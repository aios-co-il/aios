import type { DbClient } from "../supabase-clients.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether the user stopped this run from the chat (`carmen_run_cancellations`), as run-ai-agent
 * asks it before each model round and each tool, so a stopped request runs no further tools.
 * Only a stop by the run's own user counts; a run without a valid id or user can never be
 * stopped. Once seen, the answer stays true without another read. A failed read is logged
 * and reads as not stopped: a turn in progress keeps going. A caller that must refuse when
 * the answer is unknown uses `readRunStopped`.
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
    try {
      stopped = await readRunStopped(db, runId, userId);
    } catch (error) {
      console.error("[AGENT] run stop check failed", error);
    }
    return stopped;
  };
}

/**
 * One read of whether this user stopped this run. It throws when the read fails, so the
 * caller cannot take "unknown" for "not stopped": carmen-device-action refuses to hand a
 * device step to the panel on it.
 */
export async function readRunStopped(
  db: Pick<DbClient, "from">,
  runId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("carmen_run_cancellations")
    .select("run_id")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`reading the run's stop failed: ${error.message}`);
  }
  return Boolean(data);
}
