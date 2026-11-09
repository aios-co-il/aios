import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { ConnectedClient } from "../helper-results.ts";
import type { DisconnectedClient } from "../helper-results.ts";
import { fbGetToken } from "./meta-token.ts";
import { fbResolveClientAdAccount } from "./meta-client-account.ts";
import { fbListAccessibleAdAccounts } from "./meta-ad-accounts.ts";
import { fbStrongMatchAccount } from "./meta-account-match.ts";
import { fbAccountInsights } from "./meta-account-insights.ts";

// Try-to-connect pass: for every client we could NOT report from synced data,
// attempt a LIVE pull. Mapped-but-stale clients resolve via their crm config;
// truly-unmapped clients are matched by name against the token's ad accounts
// (strong match only, flagged matched_by:'name' for human verification). Returns
// the clients we connected live vs the ones that still need manual linking.
/** Retains the existing fbTryConnectClients behavior. */
export async function fbTryConnectClients(
  supabase: AgentDatabaseClient,
  tenantId: string,
  notConnected: Array<{
    client_id: string;
    client_name: string;
    reason: string;
  }>,
  days: number,
) {
  const connected: Array<ConnectedClient> = [];
  const stillNotConnected: Array<
    DisconnectedClient & { connect_attempt: string }
  > = [];
  const token = await fbGetToken(supabase, tenantId);
  let accounts: Array<{
    id: string;
    name: string;
    status: number | null;
  }> | null = null;
  for (const nc of notConnected) {
    let acct = await fbResolveClientAdAccount(supabase, tenantId, nc.client_id);
    let matchedBy: "config" | "name" | null = acct ? "config" : null;
    let matchedName: string | null = null;
    if (!acct && token) {
      if (accounts === null) {
        accounts = (await fbListAccessibleAdAccounts(token)) || [];
      }
      const m = fbStrongMatchAccount(accounts, nc.client_name);
      if (m) {
        acct = m.id;
        matchedBy = "name";
        matchedName = m.name;
      }
    }
    if (acct && token) {
      const ins = await fbAccountInsights(token, acct, days);
      if (ins) {
        connected.push({
          client_id: nc.client_id,
          client_name: nc.client_name,
          ad_account: `act_${acct}`,
          matched_by: matchedBy,
          matched_account_name: matchedName,
          ...ins,
          source: "live_meta",
        });
        continue;
      }
    }
    stillNotConnected.push({
      client_id: nc.client_id,
      client_name: nc.client_name,
      reason: nc.reason,
      connect_attempt: !token
        ? "no_fb_token"
        : acct
          ? "account_found_but_no_data"
          : "no_matching_ad_account",
    });
  }
  return { connected, stillNotConnected };
}
