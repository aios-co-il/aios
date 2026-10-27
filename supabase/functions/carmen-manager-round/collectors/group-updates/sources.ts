/**
 * Where the collector reads from: the round's service-role client (every
 * query names the tenant) and _shared/ai.ts metered under the tenant with
 * source manager_round:group_updates. A dry run outside Production may pass
 * fixtures.group_updates instead (fixtures.ts).
 */
import { aiChat } from "../../../_shared/ai.ts";
import type { CollectorContext } from "../types.ts";
import { type CardEntry, loadCardEntries } from "./card-entries.ts";
import { fixtureSources } from "./fixtures.ts";
import { GROUP_UPDATES_COLLECTOR } from "./id.ts";
import { loadLlmMeter, ROUND_SOURCE_PREFIX } from "./llm-meter.ts";
import { type LiveDraft, loadLiveDrafts } from "./live-drafts.ts";
import { type GroupHistory, loadGroupHistories } from "./messages.ts";
import { loadStaffKeys } from "./staff-keys.ts";
import type { SummarizePorts } from "./summarize.ts";

/** ai_usage_log.source of the digest calls. */
export const GROUP_LLM_SOURCE = `${ROUND_SOURCE_PREFIX}${GROUP_UPDATES_COLLECTOR}`;

export type GroupUpdateSources = {
  histories(since: Date): Promise<GroupHistory[]>;
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
    histories: (since) =>
      loadGroupHistories(db, { tenantId, since, clientIds }),
    staffKeys: () => loadStaffKeys(db, tenantId),
    cardEntries: (ids, since) =>
      loadCardEntries(db, { tenantId, clientIds: ids, since }),
    liveDrafts: () =>
      loadLiveDrafts(db, {
        tenantId,
        collectorId: GROUP_UPDATES_COLLECTOR,
        clientIds,
      }),
    summarize: {
      meter: () => loadLlmMeter(db, tenantId, ctx.settings, ctx.now),
      async ask(prompt) {
        let costUsd = 0;
        const text = await aiChat(prompt, {
          jsonMode: true,
          tenantId,
          source: GROUP_LLM_SOURCE,
          onUsage: (usage) => {
            costUsd = usage.costUsd;
          },
        });
        return { text, costUsd };
      },
    },
  };
}
