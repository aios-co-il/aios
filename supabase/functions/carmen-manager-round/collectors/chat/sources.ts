/**
 * Production wiring of the chat collector's reads and model calls: the
 * round's service-role client (every query names the tenant) and
 * _shared/ai.ts, metered under the tenant with source manager_round:chat.
 */
import { aiChat } from "../../../_shared/ai.ts";
import type { CollectorContext } from "../types.ts";
import {
  type ActivityQuery,
  type ActivityRead,
  loadThreadActivity,
  loadUnlinkedGroups,
  type UnlinkedGroupRow,
} from "./activity.ts";
import { type CallsRead, loadCompletedCalls } from "./calls.ts";
import type { AskModel, ClassifyPorts } from "./classify.ts";
import {
  type MonitoredLines,
  monitoredLines,
  tenantSlug,
} from "./connections.ts";
import type { LiveChatFinding } from "./gate.ts";
import { loadClosedChatKeys, loadLiveChatFindings } from "./live.ts";
import { CHAT_LLM_SOURCE, loadLlmMeter } from "./llm-meter.ts";
import { createReviewCache } from "./review-cache.ts";
import { loadStaffKeys } from "./roster.ts";

export type ChatSources = {
  lines(): Promise<MonitoredLines>;
  activity(query: ActivityQuery): Promise<ActivityRead>;
  unlinked(query: ActivityQuery): Promise<UnlinkedGroupRow[]>;
  staffKeys(tenantIds: string[], since: Date): Promise<Set<string>>;
  calls(
    tenantIds: string[],
    clientIds: string[],
    since: Date,
  ): Promise<CallsRead>;
  live(): Promise<LiveChatFinding[]>;
  /** `kind|fingerprint` of closed findings about messages since `since`. */
  closed(since: Date): Promise<Set<string>>;
  /** `<app>/t/<slug>/chat/`, or null without APP_URL or a slug. */
  chatLinkBase(): Promise<string | null>;
  classify: ClassifyPorts;
};

/** The sources of one tenant run; `appUrl` is the AIOS app (APP_URL). */
export function dbChatSources(
  ctx: CollectorContext,
  collectorId: string,
  appUrl: string | null,
): ChatSources {
  const { db, tenantId } = ctx;
  return {
    lines: () => monitoredLines(db, tenantId),
    activity: (query) => loadThreadActivity(db, query, collectorId),
    unlinked: (query) => loadUnlinkedGroups(db, query),
    staffKeys: (tenantIds, since) => loadStaffKeys(db, tenantIds, since),
    calls: (tenantIds, clientIds, since) =>
      loadCompletedCalls(db, tenantIds, clientIds, since),
    live: () => loadLiveChatFindings(db, tenantId, collectorId),
    closed: (since) => loadClosedChatKeys(db, tenantId, collectorId, since),
    async chatLinkBase() {
      const slug = appUrl ? await tenantSlug(db, tenantId) : null;
      return appUrl && slug
        ? `${appUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(slug)}/chat/`
        : null;
    },
    classify: {
      cache: createReviewCache(db, tenantId),
      ask: modelAsk(tenantId),
      meter: () => loadLlmMeter(db, tenantId, ctx.settings, ctx.now),
    },
  };
}

/** gpt-4o-mini in JSON mode, logged under the tenant. */
function modelAsk(tenantId: string): AskModel {
  return async (prompt) => {
    let costUsd = 0;
    const text = await aiChat(prompt, {
      jsonMode: true,
      tenantId,
      source: CHAT_LLM_SOURCE,
      onUsage: (usage) => {
        costUsd = usage.costUsd;
      },
    });
    return { text, costUsd };
  };
}
