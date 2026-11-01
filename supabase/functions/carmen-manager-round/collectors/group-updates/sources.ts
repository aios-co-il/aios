/**
 * Where the collector reads from: the round's service-role client (every
 * query names the tenant, or the clients in its scope) and the model call
 * (ask-model.ts), logged under the tenant with no money limit. The lines
 * are the chat collector's (chat/connections.ts: every member's own active
 * Green line and the org-shared ones), so both read the same lines. A
 * preview never calls the model, and a dry run outside Production may pass
 * fixtures.group_updates instead (fixtures.ts).
 */
import { monitoredLines } from "../chat/connections.ts";
import type { CollectorContext } from "../types.ts";
import { modelAsker } from "./ask-model.ts";
import { type CardEntry, loadCardEntries } from "./card-entries.ts";
import { fixtureSources } from "./fixtures.ts";
import { GROUP_UPDATES_COLLECTOR } from "./id.ts";
import { type LiveDraft, loadLiveDrafts } from "./live-drafts.ts";
import { type GroupHistory, loadGroupHistories } from "./messages.ts";
import { loadStaffKeys, type StaffKeys } from "./staff-keys.ts";
import { markersOnlyPorts, type SummarizePorts } from "./summarize.ts";
import { LOOKBACK_DAYS } from "./watermark.ts";

const DAY_MS = 86_400_000;

/** ai_usage_log.source of the digest calls. */
export const GROUP_LLM_SOURCE = `manager_round:${GROUP_UPDATES_COLLECTOR}`;

export type GroupUpdateSources = {
  /** The monitored lines (chat/connections.ts); the run keeps their ids in its watermark. */
  lines(): Promise<string[]>;
  histories(since: Date, lines: string[]): Promise<GroupHistory[]>;
  staffKeys(): Promise<StaffKeys>;
  cardEntries(clientIds: string[], since: Date): Promise<CardEntry[]>;
  liveDrafts(): Promise<LiveDraft[]>;
  summarize: SummarizePorts;
};

/** The fixture sources when the request has them, else the database's. */
export function groupUpdateSources(ctx: CollectorContext): GroupUpdateSources {
  return fixtureSources(ctx.fixtures) ?? dbSources(ctx);
}

/** The tenant's data over the service-role client. */
function dbSources(ctx: CollectorContext): GroupUpdateSources {
  const { db, tenantId, clientIds } = ctx;
  return {
    lines: async () => (await monitoredLines(db, tenantId)).ids,
    histories: (since, lines) =>
      loadGroupHistories(
        db,
        { tenantId, connectionIds: lines, since, clientIds },
        GROUP_UPDATES_COLLECTOR,
      ),
    staffKeys: () =>
      loadStaffKeys(
        db,
        tenantId,
        new Date(ctx.now.getTime() - LOOKBACK_DAYS * DAY_MS),
      ),
    cardEntries: (ids, since) => loadCardEntries(db, { clientIds: ids, since }),
    liveDrafts: () =>
      loadLiveDrafts(db, {
        tenantId,
        collectorId: GROUP_UPDATES_COLLECTOR,
        clientIds,
      }),
    summarize: ctx.dryRun
      ? markersOnlyPorts()
      : { ask: modelAsker(tenantId, GROUP_LLM_SOURCE) },
  };
}
