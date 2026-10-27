/**
 * Google Ads credentials for a report table, resolved like
 * sync-google-ads-data (AIO-238). A stale access token is refreshed in memory
 * only: the reconcile worker never writes to tenant_integrations (the sync owns
 * that, including needs_reauth).
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import {
  defaultFetch,
  type FetchLike,
  requestTimeout,
} from "../_shared/reconcile/http.ts";
import { asRecord } from "../_shared/reconcile/json.ts";
import type { ReconcileTable } from "../_shared/reconcile/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { type GoogleAuth, googleCustomerId } from "./google-api.ts";
import { findGoogleConnection } from "./google-connection.ts";

export type GoogleEnv = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
};

/** The table's Google Ads credentials; throws a typed error when it cannot be read. */
export async function resolveGoogleAuth(
  db: Pick<DbClient, "from">,
  table: ReconcileTable,
  env: GoogleEnv,
  budget: CallBudget,
  fetchFn: FetchLike = defaultFetch,
): Promise<GoogleAuth> {
  const settings = table.integration_settings || {};
  const source = String(settings.data_source || "direct_api");
  if (source === "make_api" || source === "webhook") {
    throw new ReconcileSourceError(
      "config",
      `table is filled by ${source}, not the Google Ads API`,
    );
  }
  const customerId = googleCustomerId(settings.customer_id);
  if (!customerId) {
    throw new ReconcileSourceError(
      "config",
      "no Google Ads customer on the table",
    );
  }
  if (!env.developerToken) {
    throw new ReconcileSourceError(
      "config",
      "GOOGLE_ADS_DEVELOPER_TOKEN is not set",
    );
  }
  const integration = await findGoogleConnection(db, table);
  if (!integration) {
    throw new ReconcileSourceError("auth", "no active Google Ads connection");
  }
  const s = asRecord(integration.settings);
  const expiresAt = s.expires_at ? Date.parse(String(s.expires_at)) : 0;
  const stale = !expiresAt || expiresAt < Date.now() + 5 * 60_000;
  return {
    accessToken:
      s.refresh_token && stale
        ? await refreshAccessToken(
            String(s.refresh_token),
            env,
            budget,
            fetchFn,
          )
        : String(integration.api_key),
    developerToken: env.developerToken,
    loginCustomerId: googleCustomerId(settings.manager_id) || customerId,
  };
}

/** A fresh access token for `refreshToken`; one call of the budget. */
async function refreshAccessToken(
  refreshToken: string,
  env: GoogleEnv,
  budget: CallBudget,
  fetchFn: FetchLike,
): Promise<string> {
  budget.take();
  let ok = false;
  let body: { access_token?: string; error?: string } | null = null;
  try {
    const res = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: requestTimeout(),
    });
    body = await res.json().catch(() => null);
    ok = res.ok;
  } catch (err) {
    throw new ReconcileSourceError(
      "platform",
      `Google token refresh failed: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!ok || !body?.access_token) {
    throw new ReconcileSourceError(
      "auth",
      `Google token refresh failed: ${body?.error || "unknown"}`,
    );
  }
  return body.access_token;
}
