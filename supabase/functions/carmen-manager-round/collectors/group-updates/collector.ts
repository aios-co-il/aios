/**
 * Group updates to the client card (AIO-254). Daily at 19:30
 * Israel time (a slot of the round, never replayed), for each WhatsApp group
 * linked to exactly one client: when the group had at least three
 * substantive messages since its watermark and nobody updated the card after
 * the first of them, one metered model call (or the markers) decides whether
 * it matters and drafts one card line. A material digest becomes a
 * card_stale_group finding holding the draft; an approval ("אשר <code>") or,
 * in team mode with card_write on, Carmen writes it. Otherwise only the
 * watermark advances. Groups only, from the monitored lines; another
 * tenant's copy is never read, and a group shared across tenants is read by
 * one of them.
 */
import type {
  Collector,
  CollectorContext,
  CollectorResult,
  FindingCandidate,
} from "../types.ts";
import { type CardEntry, startOfToday } from "./card-entries.ts";
import { draftCandidate } from "./candidate.ts";
import { gateWindow, type WindowAction } from "./gate.ts";
import { GROUP_UPDATES_COLLECTOR } from "./id.ts";
import { keptDrafts, type LiveDraft } from "./live-drafts.ts";
import { type GroupUpdateSources, groupUpdateSources } from "./sources.ts";
import { digestWindows, type WindowDigest } from "./summarize.ts";
import {
  advance,
  type GroupMark,
  parseWatermark,
  readFrom,
  watermarkJson,
} from "./watermark.ts";
import { type GroupWindow, groupWindows } from "./windows.ts";

export const groupUpdatesCollector: Collector = {
  id: GROUP_UPDATES_COLLECTOR,
  kinds: ["card_stale_group"],
  detectorVersion: "1",
  schedule: { cron: "30 19 * * *" },
  // Every run reports each draft that is still useful, so one miss means the
  // card caught up or the draft grew too old.
  clearAfterMisses: 1,
  collect: (ctx) => collectGroupUpdates(ctx, groupUpdateSources(ctx)),
};

/** Windows, gate, digests, then the drafts and the advanced watermark. */
export async function collectGroupUpdates(
  ctx: CollectorContext,
  sources: GroupUpdateSources,
): Promise<CollectorResult> {
  const watermark = parseWatermark(ctx.watermark, ctx.since);
  const from = readFrom(watermark, ctx.now);
  const [lines, staff, drafts] = await Promise.all([
    sources.lines(),
    sources.staff(),
    sources.liveDrafts(),
  ]);
  const histories = await sources.histories(from, lines);
  const windows = groupWindows(histories, watermark, from, staff);
  const entries = await cardEntries(sources, windows, drafts, from, ctx.now);
  const gated = windows.map((window) => ({
    window,
    action: gateWindow(window, entries),
  }));
  const { digests, llm } = await digestWindows(
    gated.filter((g) => g.action === "digest").map((g) => g.window),
    entries,
    sources.summarize,
    { budget: ctx.budget, now: ctx.now },
  );
  return {
    candidates: candidates(digests, keptDrafts(drafts, entries, ctx.now)),
    watermark: watermarkJson(advance(watermark, marks(gated), ctx.now), lines),
    coverage: { complete: true, clientIds: ctx.clientIds },
    llm,
  };
}

/** The card entries of every client in play, from the oldest point compared. */
function cardEntries(
  sources: GroupUpdateSources,
  windows: GroupWindow[],
  drafts: LiveDraft[],
  from: Date,
  now: Date,
): Promise<CardEntry[]> {
  const clientIds = [
    ...new Set([
      ...windows.map((window) => window.clientId),
      ...drafts.flatMap((draft) => draft.candidate.client_id ?? []),
    ]),
  ];
  const since = Math.min(
    from.getTime(),
    startOfToday(now).getTime(),
    ...drafts.map((draft) => Date.parse(draft.from)),
  );
  return sources.cardEntries(clientIds, new Date(since));
}

/**
 * The new drafts, then the live drafts still useful. A window digested again
 * (a run that ended before its watermark was stored) keeps its fingerprint,
 * so its new draft replaces the old one instead of adding an overlapping one.
 */
function candidates(
  digests: WindowDigest[],
  kept: FindingCandidate[],
): FindingCandidate[] {
  const fresh = digests.filter((d) => d.digest.material).map(draftCandidate);
  const replaced = new Set(fresh.map((candidate) => candidate.fingerprint));
  return [
    ...fresh,
    ...kept.filter((candidate) => !replaced.has(candidate.fingerprint)),
  ];
}

/** Each window that was digested or found covered moves to its last message. */
function marks(
  gated: { window: GroupWindow; action: WindowAction }[],
): Record<string, GroupMark> {
  return Object.fromEntries(
    gated
      .filter((g) => g.action !== "wait")
      .map((g) => [g.window.groupId, g.window.last]),
  );
}
