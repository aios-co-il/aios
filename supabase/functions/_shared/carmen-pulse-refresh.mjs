// refresh_campaign_pulse (AIO-237): Carmen recomputes the campaign pulse in chat.
//
// The tool calls campaign-pulse-snapshot for the caller's tenant only, with
// deliver:false, skip_instant_alerts:true and preview_only:true, so a refresh
// never sends the weekly digest or an instant alert. It refreshes at most once
// per tenant per PULSE_REFRESH_MIN_INTERVAL_SECONDS: a snapshot computed inside
// that window, or a claim another caller already holds, returns the stored
// snapshot instead. The snapshot is computed per tenant, so a client_id only
// checks that the caller may see the client and narrows the rows returned.

export const PULSE_REFRESH_MIN_INTERVAL_SECONDS = 600;
export const PULSE_REFRESH_TIMEOUT_MS = 120_000;
export const PULSE_REFRESH_SOURCE = "carmen_refresh_tool";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** campaign-pulse-snapshot body: one tenant, no digest, no instant alerts. */
export function buildPulseRefreshRequestBody(tenantId) {
  const id = String(tenantId ?? "").trim();
  // Without tenant_id the snapshot recomputes every tenant.
  if (!UUID_RE.test(id)) throw new Error("tenant_id must be a uuid");
  return {
    tenant_id: id,
    deliver: false,
    skip_instant_alerts: true,
    preview_only: true,
    source: PULSE_REFRESH_SOURCE,
  };
}

/** A snapshot computed inside the interval is fresh enough to return as is. */
export function decidePulseRefresh({
  lastCalculatedAt,
  now,
  minIntervalSeconds = PULSE_REFRESH_MIN_INTERVAL_SECONDS,
}) {
  const last = Date.parse(String(lastCalculatedAt ?? ""));
  if (
    Number.isFinite(last) &&
    now.getTime() - last < minIntervalSeconds * 1000
  ) {
    return { refresh: false, reason: "fresh_snapshot" };
  }
  return { refresh: true, reason: null };
}

/** Reads the snapshot function's answer for this tenant. */
export function interpretPulseSnapshotResponse(tenantId, response) {
  const body =
    response?.body && typeof response.body === "object" ? response.body : {};
  const results = Array.isArray(body.results) ? body.results : [];
  const mine = results.find((row) => row?.tenant_id === tenantId);
  if (mine?.error) {
    return { status: "refresh_failed", error: shortError(mine.error) };
  }
  if (mine) {
    return {
      status: "refreshed",
      clients: Number.isFinite(mine.clients) ? mine.clients : null,
    };
  }
  if (!response?.ok) {
    return {
      status: "refresh_failed",
      error: shortError(body.error || `HTTP ${response?.status ?? "?"}`),
    };
  }
  // No tenant_heartbeat_settings row: the snapshot has nothing to compute.
  return { status: "not_configured" };
}

function shortError(value) {
  return String(value ?? "").slice(0, 300);
}

function jerusalemParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    date: `${get("day")}.${get("month")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** "13:05" today, "25.10 13:05" on an earlier day (Israel time). */
export function formatPulseTime(value, now) {
  const at = new Date(String(value ?? ""));
  if (Number.isNaN(at.getTime())) return null;
  const when = jerusalemParts(at);
  return when.day === jerusalemParts(now).day
    ? when.time
    : `${when.date} ${when.time}`;
}

/** The one line Carmen puts before the pulse after a refresh request. */
export function buildPulseRefreshNote(status, { freshness, now }) {
  const at = formatPulseTime(freshness, now);
  const stored = at
    ? `זו הבדיקה האחרונה שנשמרה (חושבה ב-${at}).`
    : "אין בדיקת דופק שמורה.";
  switch (status) {
    case "refreshed":
      return at
        ? `🔄 רעננתי את בדיקת הדופק עכשיו (${at}).`
        : "🔄 רעננתי את בדיקת הדופק עכשיו.";
    case "fresh_snapshot":
      return `⏱️ בדיקת הדופק כבר עדכנית, ולכן לא הרצתי אותה שוב. ${stored}`;
    case "rate_limited":
      return `⏱️ הדופק רוענן בדקות האחרונות; אפשר לרענן שוב בעוד כמה דקות. ${stored}`;
    case "not_configured":
      return `⚠️ בדיקת הדופק לא מופעלת לארגון הזה, ולכן אין מה לרענן. ${stored}`;
    case "refresh_timeout":
      return `⚠️ הרענון לא הסתיים בזמן. ${stored}`;
    default:
      return `⚠️ לא הצלחתי לרענן את הדופק. ${stored}`;
  }
}

/**
 * Runs the refresh and returns the pulse like get_latest_campaign_pulse.
 *
 * deps:
 *   now()                          → Date
 *   assertClientVisible(clientId)  → throws when the caller may not see it
 *   latestCalculatedAt()           → newest calculated_at of the tenant or null
 *   claimRefresh(minIntervalSec)   → true when this call may refresh
 *   invokeSnapshot(body)           → { ok, status, body }
 *   loadPulse()                    → get_latest_campaign_pulse result
 */
export async function runCampaignPulseRefresh(input, deps) {
  const tenantId = String(input?.tenantId ?? "").trim();
  const clientId = String(input?.clientId ?? "").trim();
  const minIntervalSeconds =
    Number(input?.minIntervalSeconds) > 0
      ? Number(input.minIntervalSeconds)
      : PULSE_REFRESH_MIN_INTERVAL_SECONDS;
  if (!UUID_RE.test(tenantId)) {
    return {
      error: "tenant_required",
      message: "לא זוהה ארגון, ולכן אי אפשר לרענן את הדופק.",
    };
  }
  if (clientId) {
    if (!UUID_RE.test(clientId)) {
      return {
        error: "invalid_client_id",
        message:
          "client_id לא תקין. אפשר לחפש לקוח לפי שם עם client_name, או לרענן בלי לקוח.",
      };
    }
    try {
      await deps.assertClientVisible(clientId);
    } catch (error) {
      return {
        error: "client_not_accessible",
        message: error?.message || "הלקוח לא נמצא או מחוץ להרשאה שלך.",
      };
    }
  }

  const now = deps.now();
  let previousCalculatedAt = null;
  try {
    previousCalculatedAt = await deps.latestCalculatedAt();
  } catch {
    // The claim below still limits the rate.
  }
  const refresh = {
    status: "fresh_snapshot",
    previous_calculated_at: previousCalculatedAt,
    min_interval_minutes: Math.round(minIntervalSeconds / 60),
  };
  const decision = decidePulseRefresh({
    lastCalculatedAt: previousCalculatedAt,
    now,
    minIntervalSeconds,
  });
  if (decision.refresh) {
    let claimed = false;
    try {
      claimed = (await deps.claimRefresh(minIntervalSeconds)) === true;
      refresh.status = claimed ? "refreshed" : "rate_limited";
    } catch {
      // Fail closed: without the claim there is no rate limit.
      refresh.status = "rate_limit_unavailable";
    }
    if (claimed) {
      try {
        const response = await deps.invokeSnapshot(
          buildPulseRefreshRequestBody(tenantId),
        );
        Object.assign(
          refresh,
          interpretPulseSnapshotResponse(tenantId, response),
        );
      } catch (error) {
        refresh.status =
          error?.name === "AbortError" ? "refresh_timeout" : "refresh_failed";
        refresh.error = shortError(error?.message || error);
      }
    }
  }

  const pulse = (await deps.loadPulse()) || {};
  const refreshNote = buildPulseRefreshNote(refresh.status, {
    freshness: pulse.freshness ?? null,
    now,
  });
  return {
    ...pulse,
    auto_refreshed: refresh.status === "refreshed",
    refresh,
    refresh_note: refreshNote,
    instructions_to_agent: [
      "פתחי בשורת refresh_note כלשונה.",
      refresh.status === "refreshed"
        ? null
        : "הרענון לא רץ עכשיו: אל תטעני שהנתונים חושבו מחדש, ואל תקראי שוב ל-refresh_campaign_pulse באותה שיחה.",
      pulse.instructions_to_agent || null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** Supabase-backed deps for run-ai-agent. */
export function createPulseRefreshDeps({
  supabase,
  tenantId,
  requestedBy = null,
  supabaseUrl,
  serviceKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = PULSE_REFRESH_TIMEOUT_MS,
}) {
  return {
    now: () => new Date(),
    latestCalculatedAt: async () => {
      const { data, error } = await supabase
        .from("campaign_pulse_snapshots")
        .select("calculated_at")
        .eq("tenant_id", tenantId)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.calculated_at ?? null;
    },
    claimRefresh: async (minIntervalSeconds) => {
      const { data, error } = await supabase.rpc(
        "claim_campaign_pulse_refresh",
        {
          p_tenant_id: tenantId,
          p_min_interval_seconds: minIntervalSeconds,
          p_requested_by: requestedBy,
        },
      );
      if (error) throw error;
      return data === true;
    },
    invokeSnapshot: async (body) => {
      if (!supabaseUrl || !serviceKey) {
        throw new Error("campaign-pulse-snapshot is not configured");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/campaign-pulse-snapshot`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        let parsed = null;
        try {
          parsed = await response.json();
        } catch {
          parsed = null;
        }
        return { ok: response.ok, status: response.status, body: parsed };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
