/**
 * A current Google access token for a GA connection: the stored one while
 * it has five minutes left, else a refreshed one, saved back on the
 * connection. A refused refresh is an error here; flagging the connection
 * for reauthorisation stays with the sync, which owns that alert.
 */
import type { Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

type Integration = {
  id: string;
  api_key: string | null;
  settings: Json | null;
};

/** The connection's access token, refreshed when it is about to expire. */
export async function freshGaToken(
  db: DbClient,
  integration: Integration,
): Promise<string> {
  const settings: Record<string, unknown> =
    integration.settings &&
    typeof integration.settings === "object" &&
    !Array.isArray(integration.settings)
      ? { ...integration.settings }
      : {};
  const refreshToken =
    typeof settings.refresh_token === "string" ? settings.refresh_token : "";
  const expiresAt =
    typeof settings.expires_at === "string"
      ? new Date(settings.expires_at).getTime()
      : 0;
  const current = integration.api_key ?? "";
  if (!refreshToken || (expiresAt && expiresAt > Date.now() + 5 * 60 * 1000)) {
    return current;
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`GA token refresh failed (HTTP ${response.status})`);
  }
  settings.expires_at = new Date(
    Date.now() + Number(data.expires_in ?? 3600) * 1000,
  ).toISOString();
  // Saved only while the connection still holds the token read above, so a
  // reconnect that lands during the refresh keeps its own settings.
  const update = db
    .from("tenant_integrations")
    .update({ api_key: data.access_token, settings: settings as Json })
    .eq("id", integration.id);
  const { error } = await (integration.api_key === null
    ? update.is("api_key", null)
    : update.eq("api_key", integration.api_key));
  if (error) {
    console.error("[ga-event-users] token not saved:", error.message);
  }
  return data.access_token;
}
