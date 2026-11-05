/**
 * Meta Graph insights as a reconciliation source (AIO-238): campaign level,
 * time_increment=1, counted with the same helpers as the syncs. Read only;
 * every request takes one unit of the call budget.
 */
import type { CallBudget } from "./budget.ts";
import { ReconcileSourceError } from "./errors.ts";
import type { FetchLike, Sleep } from "./http.ts";
import { graphUrl, metaAccountPath, metaGetJson } from "./meta-api.ts";
import { readCampaignDays } from "./meta-campaign-days.ts";
import type { AccountInfo, PlatformSource, ReconcileTable } from "./types.ts";

export type MetaSourceOptions = {
  getToken: (table: ReconcileTable) => Promise<string | null>;
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
  /** Cap on pages per edge, so one huge account cannot spend the whole budget. */
  maxPages?: number;
};

type MetaAccountBody = {
  name?: string;
  currency?: string;
  timezone_name?: string;
};

/** A source that reads Meta with each table's own token, resolved once per table. */
export function createMetaSource(opts: MetaSourceOptions): PlatformSource {
  const tokens = new Map<string, string>();
  const request = { budget: opts.budget, fetch: opts.fetch, sleep: opts.sleep };
  const token = async (table: ReconcileTable) => {
    const cached = tokens.get(table.id);
    if (cached) {
      return cached;
    }
    const t = await opts.getToken(table);
    if (!t) {
      throw new ReconcileSourceError("auth", "no active Meta connection token");
    }
    tokens.set(table.id, t);
    return t;
  };

  return {
    name: "meta",
    async account(table) {
      const act = metaAccountPath(table.integration_settings?.ad_account_id);
      if (!act) {
        throw new ReconcileSourceError("config", "no ad account on the table");
      }
      const t = await token(table);
      const fields = "account_id,name,currency,timezone_name";
      const body = await metaGetJson<MetaAccountBody>(
        graphUrl(act, { fields }, t),
        request,
      );
      return {
        account_id: act,
        name: body.name || null,
        currency: body.currency || null,
        // Empty when Meta does not say: the window then falls back to UTC and
        // records timezone_fallback instead of passing UTC off as the account's.
        timezone: body.timezone_name || "",
      } satisfies AccountInfo;
    },
    async campaignDays(table, window, account) {
      const t = await token(table);
      const paged = { ...request, maxPages: opts.maxPages ?? 20 };
      return {
        rows: await readCampaignDays(account.account_id, window, t, paged),
      };
    },
  };
}
