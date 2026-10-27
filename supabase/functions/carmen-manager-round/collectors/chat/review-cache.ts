/**
 * LLM verdicts per thread (carmen_chat_thread_reviews), valid while the
 * thread's last client message is the one reviewed, so a thread is sent to
 * the model at most once per new client message.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { AI_CHAT_MODEL } from "../../../_shared/ai.ts";
import { throwIf } from "../../db-error.ts";
import { type ChatVerdict, parseVerdict } from "./verdict.ts";

export type CachedReview = { messageId: string; verdict: ChatVerdict };

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
      if (!threadKeys.length) {
        return new Map();
      }
      const { data, error } = await db
        .from("carmen_chat_thread_reviews")
        .select("thread_key, last_reviewed_message_id, verdict")
        .eq("tenant_id", tenantId)
        .in("thread_key", threadKeys);
      throwIf(error, "carmen_chat_thread_reviews");
      return new Map(
        (data ?? []).flatMap((row) => {
          const verdict = parseVerdict(row.verdict);
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
