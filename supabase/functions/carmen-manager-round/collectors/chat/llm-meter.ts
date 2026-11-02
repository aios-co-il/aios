/**
 * The round's LLM use for one tenant run: the calls made and their cost. It
 * records usage and sets no money limit; each call is also logged to
 * ai_usage_log under the tenant (CHAT_LLM_SOURCE), and the run's totals go
 * to heartbeat_logs stats. Calls are added as they finish, since the usage
 * log is written asynchronously. How many calls a run may make is
 * classify.ts's MAX_CALLS, a limit of the round's time budget.
 */

/** ai_usage_log.source of the chat classification. */
export const CHAT_LLM_SOURCE = "manager_round:chat";

export type LlmMeter = {
  /** Counts one finished call and its cost. */
  add(costUsd: number): void;
  usage(): { calls: number; costUsd: number };
};

/** A meter of this run's calls, starting at zero. */
export function createLlmMeter(): LlmMeter {
  let calls = 0;
  let costUsd = 0;
  return {
    add(cost) {
      calls += 1;
      costUsd += cost;
    },
    usage: () => ({ calls, costUsd }),
  };
}
