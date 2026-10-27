/**
 * Chat collector (AIO-252, plan components C17 and C18): client requests left
 * unanswered past the tenant's SLA in business hours (unanswered_request),
 * client complaints at any age (client_complaint) and unlinked groups that
 * look like a client's (unlinked_group), from the client threads stored from
 * the tenant's own monitored lines. It only reads, only for the kinds the
 * tenant has not turned off, and only messages within 7 days and after the
 * kinds' notify_since, so nothing older is ever raised. A wait that staff
 * answered (reply or completed call) is closed as answered with its response
 * time. The lines it read are kept in its watermark, so a tenant sharing a
 * group with this one leaves the group to it (get_client_thread_activity).
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import type { Collector, CollectorContext, CollectorResult } from "../types.ts";
import { CHAT_KINDS, enabledKinds, readSince, THREAD_KINDS } from "./scope.ts";
import { type ChatSources, dbChatSources } from "./sources.ts";
import { threadFindings } from "./thread-findings.ts";
import { unlinkedGroupCandidates } from "./unlinked.ts";

export const CHAT_COLLECTOR_ID = "chat_sla";

/** The collector over the given sources (tests pass fakes). */
export function createChatCollector(
  sources: (ctx: CollectorContext) => ChatSources,
): Collector {
  return {
    id: CHAT_COLLECTOR_ID,
    kinds: CHAT_KINDS,
    detectorVersion: "2",
    // Hourly 08–20 Israel time, Sunday to Friday: Saturday is read on Sunday.
    schedule: { cron: "0 8-20 * * 0-5" },
    collect: (ctx) => collectChat(ctx, sources(ctx)),
  };
}

/** The production collector: database reads and the metered model. */
export const chatCollector = createChatCollector((ctx) =>
  dbChatSources(ctx, CHAT_COLLECTOR_ID, Deno.env.get("APP_URL") ?? null),
);

/** Read the threads of the enabled kinds, and report findings and answered waits. */
async function collectChat(
  ctx: CollectorContext,
  src: ChatSources,
): Promise<CollectorResult> {
  const kinds = enabledKinds(ctx.settings);
  if (!kinds.length) {
    return idle(ctx, kinds, "kinds_off");
  }
  const lines = await src.lines();
  const note = lines.skipped
    ? `lines_not_monitored:${lines.skipped}`
    : undefined;
  if (!lines.ids.length) {
    return idle(ctx, kinds, note ?? "no_monitored_line");
  }
  // Each read starts where its own kinds need it (scope.ts).
  const query = (forKinds: FindingKind[]) => ({
    tenantId: ctx.tenantId,
    connectionIds: lines.ids,
    since: readSince(ctx, forKinds),
    clientIds: ctx.clientIds,
  });
  const threadKinds = kinds.filter((kind) => THREAD_KINDS.includes(kind));
  const readsThreads = threadKinds.length > 0;
  const chat = readsThreads
    ? await threadFindings(ctx, src, query(threadKinds), kinds)
    : { candidates: [], resolved: [], llm: undefined, complete: true };
  const unlinked =
    kinds.includes("unlinked_group") && !ctx.clientIds
      ? unlinkedGroupCandidates(await src.unlinked(query(["unlinked_group"])))
      : [];
  return {
    candidates: [...chat.candidates, ...unlinked],
    watermark: { read_lines: readsThreads ? lines.ids : [] },
    coverage: { complete: chat.complete, clientIds: ctx.clientIds, kinds },
    resolved: chat.resolved,
    llm: chat.llm,
    note,
  };
}

/** A run that read nothing: it clears nothing and says why. */
function idle(
  ctx: CollectorContext,
  kinds: FindingKind[],
  note: string,
): CollectorResult {
  return {
    candidates: [],
    watermark: null,
    coverage: { complete: false, clientIds: ctx.clientIds, kinds },
    note,
  };
}
