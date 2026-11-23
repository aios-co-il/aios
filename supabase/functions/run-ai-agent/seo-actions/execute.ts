import type { SeoActionToolName } from "../../_shared/carmen/seo-action-tools.ts";
import type { SeoDb } from "../seo-read/context.ts";
import {
  DEFAULT_TOP_N,
  isRefusal,
  parseSeoArgs,
  resolveSeoClient,
} from "../seo-read/client.ts";
import type { SeoAction, SeoActionContext } from "./context.ts";
import { queueSeoAction } from "./queue.ts";
import { aiVisibilityScan } from "./ai-scan.ts";
import { serpRankings } from "./serp.ts";
import { upsertKeywords } from "./keywords.ts";
import { articleDraft } from "./article-draft.ts";
import { articlePublish } from "./article-publish.ts";

/**
 * Runs one SEO action tool. A person must be asking; the client goes through
 * the read tools' resolution (tenant, shared agency, caller access). Without
 * an approved row the action is only queued with its summary and cost; the
 * approved run re-checks everything against current data before acting.
 */
export async function executeSeoActionTool(
  db: SeoDb,
  ctx: SeoActionContext,
  name: SeoActionToolName,
  args: Record<string, unknown>,
) {
  if (!ctx.actorUserId) {
    return {
      error: "human_requester_required",
      message:
        "פעולת SEO שמשנה נתונים או עולה כסף נשלחת לאישור רק בבקשה של אדם מזוהה.",
    };
  }
  const parsed = parseSeoArgs(args, DEFAULT_TOP_N);
  if (isRefusal(parsed)) {
    return parsed;
  }
  const client = await resolveSeoClient(db, ctx, parsed.clientId);
  if (isRefusal(client)) {
    return client;
  }
  const action = ACTIONS[name];
  const plan = await action.prepare(db, ctx, client, args);
  if (isRefusal(plan)) {
    return plan;
  }
  if (!ctx.approved) {
    return await queueSeoAction(db, ctx, name, client, plan);
  }
  return await action.run(db, ctx, client, plan);
}

const ACTIONS: Record<SeoActionToolName, SeoAction> = {
  run_ai_visibility_scan: aiVisibilityScan,
  check_serp_rankings: serpRankings,
  upsert_seo_keywords: upsertKeywords,
  generate_seo_article_draft: articleDraft,
  publish_seo_article: articlePublish,
};
