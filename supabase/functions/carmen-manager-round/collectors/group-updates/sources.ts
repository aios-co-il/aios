/**
 * Where the collector reads from: the round's service-role client (every
 * query names the tenant, or the clients in its scope) and the metered model
 * call (ask-model.ts). A preview never calls the model, and a dry run
 * outside Production may pass fixtures.group_updates instead (fixtures.ts).
 */
import type { CollectorContext } from "../types.ts";
import { modelAsker } from "./ask-model.ts";
import { type CardEntry, loadCardEntries } from "./card-entries.ts";
import { fixtureSources } from "./fixtures.ts";
import { GROUP_UPDATES_COLLECTOR } from "./id.ts";
import { monitoredLineIds } from "./lines.ts";
import { loadLlmMeter, ROUND_SOURCE_PREFIX } from "./llm-meter.ts";
import { type LiveDraft, loadLiveDrafts } from "./live-drafts.ts";
import { type GroupHistory, loadGroupHistories } from "./messages.ts";
import { loadStaffKeys } from "./staff-keys.ts";
import { markersOnlyPorts, type SummarizePorts } from "./summarize.ts";

/** ai_usage_log.source of the digest calls. */
export const GROUP_LLM_SOURCE = `${ROUND_SOURCE_PREFIX}${GROUP_UPDATES_COLLECTOR}`;

export type GroupUpdateSources = {
  /** The monitored lines (lines.ts); the run keeps their ids in its watermark. */
  lines(): Promise<string[]>;
  histories(since: Date, lines: string[]): Promise<GroupHistory[]>;
  staffKeys(): Promise<Set<string>>;
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
    lines: () => monitoredLineIds(db, tenantId),
    histories: (since, lines) =>
      loadGroupHistories(
        db,
        { tenantId, connectionIds: lines, since, clientIds },
        GROUP_UPDATES_COLLECTOR,
      ),
    staffKeys: () => loadStaffKeys(db, tenantId),
    cardEntries: (ids, since) => loadCardEntries(db, { clientIds: ids, since }),
    liveDrafts: () =>
      loadLiveDrafts(db, {
        tenantId,
        collectorId: GROUP_UPDATES_COLLECTOR,
        clientIds,
      }),
    summarize: ctx.dryRun
      ? markersOnlyPorts()
      : {
          meter: () => loadLlmMeter(db, tenantId, ctx.settings, ctx.now),
          ask: modelAsker(tenantId, GROUP_LLM_SOURCE),
        },
  };
}
