/**
 * The steps of one tenant's round, in order: collect, Carmen's own card
 * writes (team mode with card_write), route, the morning brief, then the due
 * messages. A dry run reads and composes, and writes or sends nothing.
 */
import { jerusalemYmd } from "../_shared/calendarTimeZone.ts";
import { sendsAnything } from "../_shared/manager-round/modes.ts";
import {
  type ManagerSettings,
  resolveManagerSettings,
} from "../_shared/manager-round/settings.ts";
import { type BriefRun, briefed, sendBriefIfDue } from "./brief/send.ts";
import { writeTeamDrafts } from "./card-drafts/autowrite.ts";
import { dueCollectors } from "./collectors/registry.ts";
import { runCollectors } from "./collectors/run.ts";
import type { RoundDeps } from "./deps.ts";
import { dispatchDue } from "./dispatch/dispatch.ts";
import { previewMessages, virtualFindings } from "./dry-run.ts";
import { notifyFloors } from "./router/floors.ts";
import { resolveBriefRecipients } from "./recipients/resolve.ts";
import { routeTenant } from "./router/route-tenant.ts";
import type { TenantReport, TenantRun } from "./tenant-run.ts";

/** Collect, route, brief and dispatch for one tenant; returns the report fields. */
export async function runSteps(
  deps: RoundDeps,
  tenantId: string,
  settings: ManagerSettings,
  run: TenantRun,
): Promise<Partial<TenantReport>> {
  const { dryRun } = run.request;
  const now = run.request.now ?? deps.clock();
  const state = await deps.state.loadState(tenantId);
  const staff = once(() => deps.directory.staff(tenantId));
  const collected = await runCollectors(deps, {
    tenantId,
    roundId: run.roundId,
    settings,
    now,
    budget: run.budget,
    state,
    due: dueCollectors(deps.collectors, state, now, run.request),
    clientIds: run.request.clientId ? [run.request.clientId] : null,
    fixtures: run.request.fixtures,
    dryRun,
  });
  const floors = notifyFloors(deps.collectors, state, now);
  // The owner may change the rollout while the collectors run; the database
  // then cancels what was planned, so write the card and route under the
  // settings stored now.
  const routing = await currentSettings(deps, tenantId);
  const virtual = dryRun ? virtualFindings(collected.candidates) : undefined;
  const cardWrites = await writeTeamDrafts(deps, {
    tenantId,
    settings: routing,
    floors,
    dryRun,
    virtual,
  });
  const routed = await routeTenant(deps, {
    tenantId,
    roundId: run.roundId,
    settings: routing,
    now,
    today: jerusalemYmd(now),
    floors,
    staff,
    dryRun,
    virtual: virtual?.filter((f) => !cardWrites?.finding_ids.includes(f.id)),
  });
  // Read again for sending: a switch while routing must stop this run's sends
  // too, or a message routing just planned under the old mode would go out;
  // each message checks once more before it starts.
  const sending = await currentSettings(deps, tenantId);
  const { brief, dispatch } = await deliver(deps, {
    tenantId,
    settings: sending,
    settingsChanged: async () =>
      JSON.stringify(await currentSettings(deps, tenantId)) !==
      JSON.stringify(sending),
    now,
    recipients: once(async () =>
      resolveBriefRecipients(await staff(), sending),
    ),
    state,
    floors,
    budget: run.sendBudget,
    dryRun,
  });
  const preview = dryRun
    ? {
        candidates: collected.candidates,
        decisions: routed.decisions,
        messages: previewMessages(routed.decisions, routed.findings),
      }
    : undefined;
  return {
    collectors: collected.reports,
    card_writes: cardWrites,
    routed: routed.decisions.length,
    gaps: routed.gaps.length,
    gaps_dropped: routed.gapsDropped,
    brief,
    dispatch,
    preview,
  };
}

/**
 * The morning brief, then the due messages, when the tenant sends at all; a
 * dry run only previews the brief.
 */
async function deliver(
  deps: RoundDeps,
  run: BriefRun,
): Promise<Pick<TenantReport, "brief" | "dispatch">> {
  if (!sendsAnything(run.settings)) {
    return { brief: null, dispatch: null };
  }
  const brief = await sendBriefIfDue(deps, run);
  const dispatch = run.dryRun
    ? null
    : await dispatchDue(deps, {
        ...run,
        skip: briefed(brief),
        briefKeys: async () =>
          new Set((await run.recipients()).map((recipient) => recipient.key)),
      });
  return { brief, dispatch };
}

/** The tenant's manager settings as stored now. */
async function currentSettings(
  deps: RoundDeps,
  tenantId: string,
): Promise<ManagerSettings> {
  return resolveManagerSettings(await deps.state.loadRules(tenantId));
}

/** Calls `load` at most once and shares its promise. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load());
}
