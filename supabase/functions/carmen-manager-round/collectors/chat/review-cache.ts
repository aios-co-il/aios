/**
 * LLM verdicts per thread (carmen_chat_thread_reviews), with the last client
 * message the model read, so it reads each client line once: the next call
 * marks only the lines after it as new.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { AI_CHAT_MODEL } from "../../../_shared/ai.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { type ChatVerdict, parseStoredVerdict } from "./verdict.ts";

export type CachedReview = { messageId: string; verdict: ChatVerdict };

/**
 * Thread keys per request: each is sent URL-encoded in the query string, and a
 * tenant's first run can ask about hundreds of groups.
 */
const KEYS_PER_READ = 100;

export type ReviewCache = {
  /** Stored verdicts by thread key. */
  load(threadKeys: string[]): Promise<Map<string, CachedReview>>;
  save(
    threadKey: string,
    review: CachedReview & { costUsd: number },
  ): Promise<void>;
};

/** The cache of one tenant over the service-role client. */
export function createReviewCache(db: DbClient, tenantId: string): ReviewCache {
  return {
    async load(threadKeys) {
      const rows = [];
      for (let at = 0; at < threadKeys.length; at += KEYS_PER_READ) {
        const { data, error } = await db
          .from("carmen_chat_thread_reviews")
          .select("thread_key, last_reviewed_message_id, verdict")
          .eq("tenant_id", tenantId)
          .in("thread_key", threadKeys.slice(at, at + KEYS_PER_READ));
        throwIf(error, "carmen_chat_thread_reviews");
        rows.push(...(data ?? []));
      }
      return new Map(
        rows.flatMap((row) => {
          const verdict = parseStoredVerdict(row.verdict);
          return verdict
            ? [
                [
                  row.thread_key,
                  { messageId: row.last_reviewed_message_id, verdict },
                ],
              ]
            : [];
        }),
      );
    },

    async save(threadKey, review) {
      const { error } = await db.from("carmen_chat_thread_reviews").upsert(
        {
          tenant_id: tenantId,
          thread_key: threadKey,
          last_reviewed_message_id: review.messageId,
          verdict: review.verdict,
          model: AI_CHAT_MODEL,
          cost_usd: review.costUsd,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,thread_key" },
      );
      throwIf(error, "carmen_chat_thread_reviews");
    },
  };
}
