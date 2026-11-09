import type { AgentDatabaseClient } from "../database-contracts.ts";

// Resolve a usable Google Calendar access token for the tenant: caller's user →
// explicit user → any campaigner with tokens → tenant owner/admin. Refreshes if
// expired. Returns { accessToken } or { error } (Hebrew, user-facing).
export async function resolveCalendarAccessToken(
  supabase: AgentDatabaseClient,
  tenantId: string,
  callerCampaignerId: string | null,
  userId: string | null,
): Promise<{ accessToken?: string; error?: string }> {
  let calTokenUserId: string | null = null;
  if (callerCampaignerId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("campaigner_id", callerCampaignerId)
      .maybeSingle();
    if (prof?.id) {
      calTokenUserId = prof.id;
    }
  }
  if (!calTokenUserId && userId && userId !== "system") {
    calTokenUserId = userId;
  }
  if (!calTokenUserId) {
    const { data: tenantCampaigners } = await supabase
      .from("campaigners")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(20);
    for (const c of tenantCampaigners || []) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("campaigner_id", c.id)
        .maybeSingle();
      if (!prof?.id) {
        continue;
      }
      const { data: tok } = await supabase
        .from("calendar_tokens")
        .select("user_id")
        .eq("user_id", prof.id)
        .maybeSingle();
      if (tok?.user_id) {
        calTokenUserId = tok.user_id;
        break;
      }
    }
  }
  if (!calTokenUserId) {
    // Owners (e.g. a second-tenant owner) are tenant_users without a campaigner row.
    const { data: owners } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"])
      .limit(10);
    for (const o of owners || []) {
      const { data: tok } = await supabase
        .from("calendar_tokens")
        .select("user_id")
        .eq("user_id", o.user_id)
        .maybeSingle();
      if (tok?.user_id) {
        calTokenUserId = o.user_id;
        break;
      }
    }
  }
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
