/**
 * Meta ad accounts a connection's token can see, with their recent spend
 * (AIO-238), for the unmapped-accounts check.
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import type { FetchLike, Sleep } from "../_shared/reconcile/http.ts";
import {
  graphUrl,
  metaAccountPath,
  metaGetPaged,
} from "../_shared/reconcile/meta-api.ts";

export type MetaAccountWithSpend = {
  account_id: string;
  name: string | null;
  currency: string | null;
  spend_7d: number;
};

type MetaAdAccount = {
  account_id?: string;
  id?: string;
  name?: string;
  currency?: string;
  insights?: { data?: Array<{ spend?: string | number }> };
};

/** Meta ad accounts a token can see, with spend over the last 7 complete days. */
export async function listMetaAccountsWithSpend(opts: {
  token: string;
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
  maxPages?: number;
}): Promise<MetaAccountWithSpend[]> {
  const accounts = await metaGetPaged<MetaAdAccount>(
    graphUrl(
      "me/adaccounts",
      {
        // date_preset last_7d = the 7 complete days before today, in each
        // account's own time zone. One request per 100 accounts.
        fields: "account_id,name,currency,insights.date_preset(last_7d){spend}",
        limit: "100",
      },
      opts.token,
    ),
    {
      budget: opts.budget,
      fetch: opts.fetch,
      sleep: opts.sleep,
      maxPages: opts.maxPages ?? 10,
    },
  );
  return accounts
    .map((acct) => {
      const spend = Number(acct?.insights?.data?.[0]?.spend || 0);
      return {
        account_id: metaAccountPath(acct.account_id || acct.id) || "",
        name: acct.name || null,
        currency: acct.currency || null,
        spend_7d: Number.isFinite(spend) ? spend : 0,
      };
    })
    .filter((a) => a.account_id);
}
