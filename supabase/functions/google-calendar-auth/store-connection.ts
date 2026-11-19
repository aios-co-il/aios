import {
  callbackUri,
  exchangeGoogleCode,
  googleAccountEmail,
} from "../_shared/google-oauth/exchange-code.ts";
import { UserFacingError } from "../_shared/google-oauth/user-facing-error.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { missingCalendarScopes } from "./scopes.ts";

/**
 * Exchanges a Google authorization code and stores the user's Calendar
 * connection, then starts the push channel. Called only from `complete`,
 * after the state was verified for the signed-in user.
 */
export async function storeCalendarConnection(
  code: string,
  userId: string,
): Promise<void> {
  const tokens = await exchangeGoogleCode(
    code,
    callbackUri("google-calendar-auth", "callback"),
  );
  if (missingCalendarScopes(tokens).length > 0) {
    throw new UserFacingError(
      "Calendar permission is missing. Connect Calendar again, allowing both event and calendar list access. Your existing connection has been kept.",
    );
  }

  const supabase = serviceClient();

  // Google omits refresh_token on a re-auth without prompt=consent; keep the stored one.
  let refreshToken = tokens.refresh_token ?? null;
  if (!refreshToken) {
    const { data: existing, error } = await supabase
      .from("calendar_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`calendar_tokens lookup failed: ${error.message}`);
    }
    refreshToken = existing?.refresh_token || null;
  }
  if (!refreshToken) {
    throw new UserFacingError(
      "No refresh token available. Please disconnect and reconnect granting offline access.",
    );
  }

  // One row per user (calendar_tokens_user_id_key), so a reconnect updates it.
  const { error: dbError } = await supabase.from("calendar_tokens").upsert(
    {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      google_email: (await googleAccountEmail(tokens.access_token)) || null,
      needs_reconnect: false,
      sync_status: "connected",
      sync_error: null,
    },
    { onConflict: "user_id" },
  );
  if (dbError) {
    throw new Error(`calendar_tokens upsert failed: ${dbError.message}`);
  }

  await startWatch(userId);
}

/** Starts (or renews) the push channel so changes made in Google flow back. A failure leaves the connection in place. */
async function startWatch(userId: string): Promise<void> {
  try {
    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-watch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
        },
        body: JSON.stringify({ user_id: userId }),
      },
    );
  } catch (e) {
    console.warn("Failed to start calendar watch on connect (non-fatal):", e);
  }
}
