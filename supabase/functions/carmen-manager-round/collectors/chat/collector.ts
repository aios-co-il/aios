/**
 * Chat collector (AIO-252, plan components C17 and C18): client requests left
 * unanswered past the tenant's SLA in business hours (unanswered_request),
 * client complaints (client_complaint) and unlinked groups that look like a
 * client's (unlinked_group), from the client threads stored from the
 * tenant's own monitored lines. It only reads: messages after the earliest
 * notify_since of its kinds and within 7 days, so nothing older is ever
 * raised. A wait that staff answered (reply or completed call) is closed as
 * answered with its response time.
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import { kindNotifySince } from "../../../_shared/manager-round/modes.ts";
import type { Collector, CollectorContext, CollectorResult } from "../types.ts";
import type { ActivityQuery } from "./activity.ts";
import { answeredWaits } from "./answered.ts";
import { waitCandidates } from "./candidates.ts";
import { classifyWaits } from "./classify.ts";
import { gateThreads } from "./gate.ts";
import { type ChatSources, dbChatSources } from "./sources.ts";
import { buildThreads, type Thread } from "./threads.ts";
import { unlinkedGroupCandidates } from "./unlinked.ts";

export const CHAT_COLLECTOR_ID = "chat_sla";

const KINDS: readonly FindingKind[] = [
  "unanswered_request",
  "client_complaint",
  "unlinked_group",
];
const WINDOW_DAYS = 7;

/** The collector over the given sources (tests pass fakes). */
export function createChatCollector(
  sources: (ctx: CollectorContext) => ChatSources,
): Collector {
  return {
    id: CHAT_COLLECTOR_ID,
    kinds: KINDS,
    detectorVersion: "1",
    // Hourly 08–20 Israel time, Sunday to Friday: Saturday is read on Sunday.
    schedule: { cron: "0 8-20 * * 0-5" },
    collect: (ctx) => collectChat(ctx, sources(ctx)),
  };
}

/** The production collector: database reads and the metered model. */
export const chatCollector = createChatCollector((ctx) =>
  dbChatSources(ctx, CHAT_COLLECTOR_ID, Deno.env.get("APP_URL") ?? null),
);

/** Read the threads, review the waits, and report findings and answered waits. */
async function collectChat(
  ctx: CollectorContext,
  src: ChatSources,
): Promise<CollectorResult> {
  const connectionIds = await src.connectionIds();
  if (!connectionIds.length) {
    // No line to read: clear nothing rather than everything.
    return {
      candidates: [],
      watermark: null,
      coverage: { complete: false, clientIds: ctx.clientIds },
    };
  }
  const query: ActivityQuery = {
    tenantId: ctx.tenantId,
    connectionIds,
    since: readSince(ctx),
    clientIds: ctx.clientIds,
  };
  const threads = await readThreads(src, query);
  const live = await src.live();
  const gated = gateThreads(threads, live, ctx.settings, ctx.now);
  const { reviews, llm } = await classifyWaits(gated, src.classify, ctx);
  const linkBase = await src.chatLinkBase();
  const candidates = [
    ...waitCandidates(reviews, (id) => (linkBase ? `${linkBase}${id}` : null)),
    ...(ctx.clientIds
      ? []
      : unlinkedGroupCandidates(await src.unlinked(query))),
  ];
  return {
    candidates,
    watermark: null,
    coverage: { complete: true, clientIds: ctx.clientIds },
    resolved: answeredWaits(threads, live, candidates, ctx.settings),
    llm,
  };
}

/** The earliest notify_since of the collector's kinds, but at most 7 days back. */
export function readSince(
  ctx: Pick<CollectorContext, "settings" | "now">,
): Date {
  const stamps = KINDS.flatMap((kind) => {
    const since = kindNotifySince(ctx.settings, kind);
    return since ? [Date.parse(since)] : [];
  });
  const floor = ctx.now.getTime() - WINDOW_DAYS * 86_400_000;
  return new Date(Math.max(floor, ...minOf(stamps)));
}

/** Threads with their clients' calls and the staff roster of every tenant involved. */
async function readThreads(
  src: ChatSources,
  query: ActivityQuery,
): Promise<Thread[]> {
  const rows = await src.activity(query);
  const clientIds = [...new Set(rows.map((row) => row.client_id))];
  const clientTenants = rows.flatMap((row) => row.client_tenant_id ?? []);
  const tenantIds = [...new Set([query.tenantId, ...clientTenants])];
  const [staffKeys, calls] = await Promise.all([
    src.staffKeys(tenantIds),
    src.calls(tenantIds, clientIds, query.since),
  ]);
  return buildThreads(rows, staffKeys, calls);
}

/** [the smallest value], or [] for none. */
function minOf(values: number[]): number[] {
  return values.length ? [Math.min(...values)] : [];
}
