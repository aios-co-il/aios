import type { AgentDatabaseClient } from "../database-contracts.ts";
import { errorMessage } from "../error-message.ts";

/** Auto-creates a task event; no-ops without the campaigner's connected calendar. */
export async function tryCreateCalendarEventForTask(
  supabase: AgentDatabaseClient,
  taskId: string,
  title: string,
  dueDate: string,
  dueTime: string,
  durationMinutes: number | null,
  campaignerId: string,
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("campaigner_id", campaignerId)
      .maybeSingle();
    if (!profile?.id) {
      return;
    }

    const { data: tokenData } = await supabase
      .from("calendar_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!tokenData) {
      return;
    }

    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) <= new Date()) {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        return;
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
        return;
      }
      accessToken = rd.access_token;
      await supabase
        .from("calendar_tokens")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
        })
        .eq("user_id", profile.id);
    }

    const start = new Date(`${dueDate}T${dueTime}`);
    const end = new Date(start.getTime() + (durationMinutes || 30) * 60_000);
    const calResp = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title,
          description: "משימה ממערכת AIOS",
          start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
          end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
        }),
      },
    );
    if (calResp.ok) {
      const ev = await calResp.json();
      if (ev.id) {
        await supabase
          .from("tasks")
          .update({ google_calendar_event_id: ev.id })
          .eq("id", taskId);
      }
    } else {
      const e = await calResp.json().catch(() => ({}));
      console.warn(
        "[create_task] calendar event failed:",
        calResp.status,
        e?.error?.message,
      );
    }
  } catch (e) {
    console.warn("[create_task] calendar sync error:", errorMessage(e));
  }
}
