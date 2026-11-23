import { resolveGoogleCalendarUserId } from "./calendar-user-id.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";

// Resolve a usable Google Calendar access token for the tenant: caller's user →
// explicit user → any campaigner with tokens → tenant owner/admin. Refreshes if
// expired. Returns { accessToken } or { error } (Hebrew, user-facing).
export async function resolveCalendarAccessToken(
  supabase: DbClient,
  tenantId: string,
  callerCampaignerId: string | null,
  userId: string | null,
): Promise<{ accessToken?: string; error?: string }> {
  const calTokenUserId = await resolveGoogleCalendarUserId(
    supabase,
    tenantId,
    callerCampaignerId,
    userId,
  );
  if (!calTokenUserId) {
    return {
      error:
        "לא נמצא חיבור Google Calendar פעיל בטננט. חבר יומן תחת הגדרות אינטגרציות.",
    };
  }

  const { data: tokenData } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", calTokenUserId)
    .maybeSingle();
  if (!tokenData) {
    return {
      error: "לא נמצא חיבור Google Calendar. חבר יומן תחת הגדרות אינטגרציות.",
    };
  }
  let accessToken: string = tokenData.access_token;
  if (new Date(tokenData.expires_at) <= new Date()) {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return { error: "חסרות הגדרות GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" };
    }
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const rd = await r.json();
    if (!rd.access_token) {
      return { error: `רענון טוקן נכשל: ${rd.error || "unknown"}` };
    }
    accessToken = rd.access_token;
    await supabase
      .from("calendar_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
      })
      .eq("user_id", calTokenUserId);
  }
  return { accessToken };
}
