/**
 * The steps of one tenant's round, in order: collect, route, the morning
 * brief, then the due messages. A dry run reads and composes, and writes or
 * sends nothing.
 */
import { jerusalemYmd } from "../_shared/calendarTimeZone.ts";
import { sendsAnything } from "../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../_shared/manager-round/settings.ts";
import { sendBriefIfDue } from "./brief/send.ts";
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
  const routed = await routeTenant(deps, {
    tenantId,
    roundId: run.roundId,
    settings,
    now,
    today: jerusalemYmd(now),
    floors,
    staff,
    dryRun,
    virtual: dryRun ? virtualFindings(collected.candidates) : undefined,
  });
  const sends = sendsAnything(settings);
  const brief = sends
    ? await sendBriefIfDue(deps, {
        tenantId,
        settings,
        now,
        recipients: async () => resolveBriefRecipients(await staff(), settings),
        floors,
        dryRun,
      })
    : null;
  const skip = new Set(brief?.sent.map((entry) => entry.key) ?? []);
  const dispatch =
    sends && !dryRun
      ? await dispatchDue(deps, { tenantId, settings, now, skip })
      : null;
  const preview = dryRun
    ? {
        candidates: collected.candidates,
        decisions: routed.decisions,
        messages: previewMessages(routed.decisions, routed.findings),
      }
    : undefined;
  return {
    collectors: collected.reports,
    routed: routed.decisions.length,
    gaps: routed.gaps.length,
    brief,
    dispatch,
    preview,
  };
}

/** Calls `load` at most once and shares its promise. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load());
}
