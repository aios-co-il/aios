/**
 * Instant WhatsApp alerts from campaign pulse snapshots.
 * Scoped owner + responsible team managers receive per-campaign alerts (deduped).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { isPulseDeliveryExcludedPhone } from "./campaign-pulse.ts";
import { normalizeNotifyPhone } from "./carmen-notify-target.ts";
import { isJerusalemShabbat, jerusalemYmd } from "./calendarTimeZone.ts";
import { isAlertHeldForShabbat, isCriticalAlert } from "./critical-alerts.ts";

export type PulseAlertRuleType =
  "no_contact" | "cpl_spike" | "connection_lost" | "campaign_exception";

export type PulseAlertRules = {
  instant_wa_enabled?: boolean;
  no_contact_enabled?: boolean;
  no_contact_days?: number;
  cpl_spike_enabled?: boolean;
  cpl_spike_pct?: number;
  disconnected_enabled?: boolean;
};

export const DEFAULT_PULSE_ALERT_RULES: PulseAlertRules = {
  instant_wa_enabled: true,
  no_contact_enabled: true,
  no_contact_days: 14,
  cpl_spike_enabled: true,
  cpl_spike_pct: 50,
  disconnected_enabled: true,
};

export type PulseInstantAlertCandidate = {
  client_id: string;
  client_name: string;
  rule_type: PulseAlertRuleType;
  message: string;
  campaign_key?: string | null;
  fingerprint?: string | null;
  severity_score?: number | null;
  evidence?: Record<string, unknown>;
  /**
   * connection_lost only: true when the cause is a real connection loss
   * (stale or missing sync, no connected campaign table, an account-level
   * stop/disable). Only these may go out on Shabbat; a connection_lost made
   * only of single-campaign issues (stopped campaign, disapproved ad) waits.
   */
  shabbat_critical?: boolean;
};

export type PulseSnapshotAlertInput = {
  client_id: string;
  client_name?: string | null;
  status?: string | null;
  cpl_change_pct?: number | null;
  flags?: string[] | null;
  last_client_call_at?: string | null;
  campaign_goal_mode?: string | null;
  lead_goal_status?: string | null;
  ecommerce_goal_status?: string | null;
  agency_id?: string | null;
  campaign_breakdown?: Array<{
    campaign_key?: string | null;
    campaign_name?: string | null;
    goal?: string | null;
    status_reason?: string | null;
    alert_eligible?: boolean | null;
    target_kind?: string | null;
    target_value?: number | null;
    efficiency_3d?: number | null;
    efficiency_7d?: number | null;
    trend_3d_pct?: number | null;
    trend_7d_pct?: number | null;
    data_fresh_through?: string | null;
    last_change_at?: string | null;
  }> | null;
};

type CriticalIssueLike = {
  clientId: string;
  clientName?: string | null;
  alertType?: string | null;
  campaignName?: string | null;
};

type QueueWhatsApp = (
  message: string,
  chatId: string | null,
) => Promise<boolean>;

/**
 * Optional model wording for a campaign_exception (AIO-243). The model never
 * decides whether an alert is sent: the deterministic candidate goes out
 * either way, and these two short Hebrew lines are only added when valid.
 */
export type PulseExceptionWording = {
  summary?: string | null;
  recommended_check?: string | null;
};

export type PhrasePulseException = (
  candidate: PulseInstantAlertCandidate,
  opts: { signal: AbortSignal },
) => Promise<PulseExceptionWording | null>;

export type PulseAiWordingEvidence = {
  applied: boolean;
  error?:
    | "not_configured"
    | "timeout"
    | "call_failed"
    | "no_wording"
    | "invented_number"
    | "invalid_text";
};

export const PULSE_WORDING_TIMEOUT_MS = 8000;
export const PULSE_WORDING_MAX_CHARS = 240;
export const PULSE_WORDING_SUMMARY_LABEL = "סיכום כרמן:";
const RECOMMENDED_CHECK_LABEL = "בדיקה מומלצת:";
const DEFAULT_EXCEPTION_CHECK_LINE = `${RECOMMENDED_CHECK_LABEL} לאמת יעד, אירוע אופטימיזציה ושינויים אחרונים לפני פעולה.`;

// A number, or a date/time/range compared whole, so "2026-10-20T08:00" in the
// evidence does not make "20" or "8" look like known numbers.
const NUMBER_TOKEN = /\d+(?:(?:[.,:/-]|T)\d+)*/g;

function numberTokens(text: string): string[] {
  return (text.match(NUMBER_TOKEN) || []).map((token) => {
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token)) {
      return String(Number(token.replaceAll(",", ""))); // 1,200 → 1200
    }
    if (/^\d+(?:[.,]\d+)?$/.test(token)) {
      return String(Number(token.replace(",", "."))); // 52.0 → 52, 3,5 → 3.5
    }
    return token;
  });
}

function evidenceValueTokens(value: unknown, out: string[]): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(...numberTokens(String(value)));
  } else if (typeof value === "string") {
    out.push(...numberTokens(value));
  } else if (Array.isArray(value)) {
    for (const item of value) evidenceValueTokens(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) evidenceValueTokens(item, out);
  }
}

/** Every number the deterministic message and evidence values already show. */
function deterministicNumbers(
  candidate: PulseInstantAlertCandidate,
): Set<string> {
  const tokens = numberTokens(candidate.message);
  evidenceValueTokens(candidate.evidence || {}, tokens);
  return new Set(tokens);
}

type WordingLine =
  | { ok: true; text: string }
  | { ok: false; reason: "missing" | "invented_number" | "invalid_text" };

/**
 * One model line, made safe for WhatsApp: a single line without markdown or
 * direction-control characters, at most PULSE_WORDING_MAX_CHARS long, and
 * without any number the deterministic evidence does not already contain.
 */
export function sanitizePulseWordingLine(
  raw: unknown,
  allowedNumbers: Set<string>,
): WordingLine {
  if (raw === null || raw === undefined)
    return { ok: false, reason: "missing" };
  if (typeof raw !== "string") return { ok: false, reason: "invalid_text" };
  let text = raw
    .replace(/\p{Cc}/gu, " ") // newlines, tabs and other control characters
    .replace(/\p{Cf}/gu, "") // zero-width and direction marks
    .replace(/[*_~`#>|[\]{}<]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // The message adds its own labels; drop one the model repeated.
    .replace(/^[-•:\s]*(?:(?:סיכום כרמן|סיכום|בדיקה מומלצת)\s*:)?[-•:\s]*/, "")
    .trim();
  if (!text) return { ok: false, reason: "missing" };
  if (/https?:\/\/|www\./i.test(text))
    return { ok: false, reason: "invalid_text" };
  // Digits from other scripts cannot be checked against the evidence.
  if (/(?![0-9])\p{Nd}/u.test(text))
    return { ok: false, reason: "invented_number" };
  if (numberTokens(text).some((token) => !allowedNumbers.has(token))) {
    return { ok: false, reason: "invented_number" };
  }
  if (text.length > PULSE_WORDING_MAX_CHARS) {
    const cut = text.slice(0, PULSE_WORDING_MAX_CHARS - 1);
    const lastSpace = cut.lastIndexOf(" ");
    const kept =
      lastSpace > PULSE_WORDING_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut;
    text = `${kept.trim()}…`;
  }
  return { ok: true, text };
}

/**
 * Adds valid model wording to the deterministic message. Every data line
 * stays exactly as built by code; the summary goes above the recommended
 * check, and a model check replaces only the generic static check line.
 */
export function applyPulseExceptionWording(
  candidate: PulseInstantAlertCandidate,
  wording: PulseExceptionWording | null | undefined,
): { message: string; ai_wording: PulseAiWordingEvidence } {
  if (!wording || typeof wording !== "object") {
    return {
      message: candidate.message,
      ai_wording: { applied: false, error: "no_wording" },
    };
  }
  const allowed = deterministicNumbers(candidate);
  const summary = sanitizePulseWordingLine(wording.summary, allowed);
  const check = sanitizePulseWordingLine(wording.recommended_check, allowed);
  const lines = candidate.message.split("\n");
  const staticCheckAt = lines.indexOf(DEFAULT_EXCEPTION_CHECK_LINE);
  const useCheck = check.ok && staticCheckAt >= 0;
  const summaryLine = summary.ok
    ? `${PULSE_WORDING_SUMMARY_LABEL} ${summary.text}`
    : null;

  if (useCheck) {
    lines[staticCheckAt] = `${RECOMMENDED_CHECK_LABEL} ${check.text}`;
  }
  if (summaryLine) {
    if (staticCheckAt >= 0) lines.splice(staticCheckAt, 0, summaryLine);
    else lines.push("", summaryLine);
  }

  const applied = Boolean(summaryLine) || useCheck;
  const rejected = [summary, check].flatMap((line) =>
    line.ok ? [] : [line.reason],
  );
  let error: PulseAiWordingEvidence["error"];
  if (rejected.includes("invented_number")) error = "invented_number";
  else if (rejected.includes("invalid_text")) error = "invalid_text";
  else if (!applied) error = "no_wording";
  return {
    message: applied ? lines.join("\n") : candidate.message,
    ai_wording: error ? { applied, error } : { applied },
  };
}

/**
 * Asks the model for wording with a hard timeout. Any failure, timeout or
 * invalid answer leaves the deterministic message unchanged; nothing here
 * throws, so one bad call never stops the remaining alerts of the run.
 */
export async function wordPulseException(
  candidate: PulseInstantAlertCandidate,
  phrase: PhrasePulseException | undefined,
  timeoutMs = PULSE_WORDING_TIMEOUT_MS,
): Promise<{
  message: string;
  ai_wording: PulseAiWordingEvidence;
  called: boolean;
}> {
  if (!phrase) {
    return {
      message: candidate.message,
      ai_wording: { applied: false, error: "not_configured" },
      called: false,
    };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timeout");
  try {
    // Promise.race also handles a rejection that arrives after the timeout.
    const answer = await Promise.race([
      phrase(candidate, { signal: controller.signal }),
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), timeoutMs);
      }),
    ]);
    if (answer === timedOut) {
      controller.abort();
      return {
        message: candidate.message,
        ai_wording: { applied: false, error: "timeout" },
        called: true,
      };
    }
    return { ...applyPulseExceptionWording(candidate, answer), called: true };
  } catch (error) {
    console.warn(
      "[pulse-instant-alerts] exception wording failed; sending deterministic text",
      error instanceof Error ? error.message : String(error),
    );
    return {
      message: candidate.message,
      ai_wording: { applied: false, error: "call_failed" },
      called: true,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const RULE_THROTTLE_HOURS: Record<PulseAlertRuleType, number> = {
  no_contact: 7 * 24,
  cpl_spike: 7 * 24,
  connection_lost: 24,
  campaign_exception: 7 * 24,
};

/**
 * Deterministic fingerprint for the client-level rules (rule:client:bucket).
 * campaign_exception keeps its own campaign/reason/target fingerprint.
 */
export function legacyRuleFingerprint(
  ruleType: Exclude<PulseAlertRuleType, "campaign_exception">,
  clientId: string,
  bucket: string,
): string {
  return `${ruleType}:${clientId}:${bucket}`;
}

/**
 * pulse_instant_alert_log rows written before AIO-226 have fingerprint NULL
 * (the client-level rules had none). Inside the throttle window such a row is
 * the same finding, so deploying the fingerprints causes no resend wave.
 */
export function isSameInstantAlertFinding(
  loggedFingerprint: string | null | undefined,
  candidateFingerprint: string | null | undefined,
): boolean {
  const logged = loggedFingerprint ?? null;
  if (logged === null) return true;
  return logged === (candidateFingerprint ?? null);
}

export type InstantAlertLogRow = {
  fingerprint?: string | null;
  severity_score?: number | string | null;
};

/**
 * Decide against the log rows of this client + rule (+ campaign) inside the
 * rule's throttle window, newest first. Any matching row suppresses a resend,
 * so a finding that flaps A → B → A inside the window is not sent again.
 * Only campaign_exception resends when it got materially (10%) worse.
 */
export function decideInstantAlertDelivery(
  candidate: Pick<
    PulseInstantAlertCandidate,
    "rule_type" | "fingerprint" | "severity_score"
  >,
  recentRows: InstantAlertLogRow[],
): { send: boolean; reason: "new" | "duplicate" | "materially_worse" } {
  const match = recentRows.find((row) =>
    isSameInstantAlertFinding(row.fingerprint, candidate.fingerprint),
  );
  if (!match) return { send: true, reason: "new" };
  if (
    candidate.rule_type === "campaign_exception" &&
    Number(candidate.severity_score || 0) >
      Number(match.severity_score || 0) * 1.1
  ) {
    return { send: true, reason: "materially_worse" };
  }
  return { send: false, reason: "duplicate" };
}

/** campaign-pulse-manual-trigger marks its preview runs with this source. */
export const PULSE_MANUAL_TRIGGER_SOURCE = "approved_manual_trigger";

export type InstantPulseAlertsGate =
  | { run: true; reason: null }
  | {
      run: false;
      reason:
        | "skip_instant_alerts"
        | "preview_only"
        | "manual_trigger"
        | "pulse_disabled"
        | "instant_wa_disabled";
    };

/**
 * Instant alerts run on a snapshot refresh only when the tenant has the pulse
 * on, the instant WhatsApp switch on, and the request is a real refresh: not a
 * preview, not the manual trigger, and not a caller that asked for a refresh
 * without alerts (`skip_instant_alerts: true`).
 */
export function instantPulseAlertsGate(input: {
  campaignPulseEnabled: unknown;
  rules: unknown;
  body: Record<string, unknown> | null | undefined;
}): InstantPulseAlertsGate {
  const body = input.body || {};
  if (body.skip_instant_alerts === true)
    return { run: false, reason: "skip_instant_alerts" };
  if (body.preview_only === true) return { run: false, reason: "preview_only" };
  if (body.source === PULSE_MANUAL_TRIGGER_SOURCE)
    return { run: false, reason: "manual_trigger" };
  if (input.campaignPulseEnabled !== true)
    return { run: false, reason: "pulse_disabled" };
  if (
    !input.rules ||
    typeof input.rules !== "object" ||
    parsePulseAlertRules(input.rules).instant_wa_enabled !== true
  ) {
    return { run: false, reason: "instant_wa_disabled" };
  }
  return { run: true, reason: null };
}

export function parsePulseAlertRules(raw: unknown): PulseAlertRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PULSE_ALERT_RULES };
  const input = raw as Record<string, unknown>;
  return {
    instant_wa_enabled: input.instant_wa_enabled !== false,
    no_contact_enabled: input.no_contact_enabled !== false,
    no_contact_days: Math.max(
      1,
      Number(input.no_contact_days) ||
        DEFAULT_PULSE_ALERT_RULES.no_contact_days!,
    ),
    cpl_spike_enabled: input.cpl_spike_enabled !== false,
    cpl_spike_pct: Math.max(
      1,
      Number(input.cpl_spike_pct) || DEFAULT_PULSE_ALERT_RULES.cpl_spike_pct!,
    ),
    disconnected_enabled: input.disconnected_enabled !== false,
  };
}

function flagList(flags: string[] | null | undefined): string[] {
  return Array.isArray(flags) ? flags.filter(Boolean) : [];
}

export function evaluatePulseInstantAlerts(
  snapshots: PulseSnapshotAlertInput[],
  criticalIssues: CriticalIssueLike[],
  rulesInput: unknown,
  nowMs = Date.now(),
): PulseInstantAlertCandidate[] {
  const rules = parsePulseAlertRules(rulesInput);
  if (!rules.instant_wa_enabled) return [];

  const candidates: PulseInstantAlertCandidate[] = [];
  const criticalByClient = new Map<string, CriticalIssueLike[]>();
  for (const issue of criticalIssues) {
    const list = criticalByClient.get(issue.clientId) || [];
    list.push(issue);
    criticalByClient.set(issue.clientId, list);
  }

  for (const snapshot of snapshots) {
    const clientName = snapshot.client_name?.trim() || "לקוח";
    const flags = flagList(snapshot.flags);
    const campaignBreakdown = Array.isArray(snapshot.campaign_breakdown)
      ? snapshot.campaign_breakdown
      : [];

    for (const campaign of campaignBreakdown) {
      if (campaign.alert_eligible !== true || !campaign.campaign_key) continue;
      const target =
        campaign.target_value === null || campaign.target_value === undefined
          ? "אין יעד מאושר"
          : `${String(campaign.target_kind || "יעד").toUpperCase()} ${campaign.target_value}`;
      const severity = Math.max(
        1,
        Math.abs(Number(campaign.trend_3d_pct) || 0),
        Math.abs(Number(campaign.trend_7d_pct) || 0),
      );
      const fingerprint = [
        campaign.campaign_key,
        campaign.status_reason || "campaign_exception",
        campaign.target_kind || "no_target",
        campaign.target_value ?? "none",
      ].join(":");
      const evidence = {
        goal: campaign.goal || null,
        target_kind: campaign.target_kind || null,
        target_value: campaign.target_value ?? null,
        efficiency_3d: campaign.efficiency_3d ?? null,
        efficiency_7d: campaign.efficiency_7d ?? null,
        trend_3d_pct: campaign.trend_3d_pct ?? null,
        trend_7d_pct: campaign.trend_7d_pct ?? null,
        data_fresh_through: campaign.data_fresh_through ?? null,
        last_change_at: campaign.last_change_at ?? null,
      };
      candidates.push({
        client_id: snapshot.client_id,
        client_name: clientName,
        rule_type: "campaign_exception",
        campaign_key: campaign.campaign_key,
        fingerprint,
        severity_score: severity,
        evidence,
        message: [
          "🔴 *התראת דופק — חריגת קמפיין מאומתת*",
          `לקוח: ${clientName}`,
          `קמפיין: ${campaign.campaign_name || campaign.campaign_key}`,
          `קטגוריה: ${campaign.goal || "לא מסווג"}`,
          `סיבה: ${campaign.status_reason || "חריגה מתמשכת"}`,
          `יעד: ${target}`,
          `3 ימים: ${campaign.efficiency_3d ?? "חסר"} · 7 ימים: ${campaign.efficiency_7d ?? "חסר"}`,
          `שינוי אחרון: ${campaign.last_change_at || "לא זמין"}`,
          `נתונים עד: ${campaign.data_fresh_through || "לא זמין"}`,
          "",
          DEFAULT_EXCEPTION_CHECK_LINE,
          "AIOS → דשבורד דופק",
        ].join("\n"),
      });
    }

    if (rules.no_contact_enabled) {
      const days = rules.no_contact_days ?? 14;
      const staleMs = days * 24 * 60 * 60 * 1000;
      const lastContact = snapshot.last_client_call_at
        ? new Date(snapshot.last_client_call_at).getTime()
        : Number.NaN;
      const missing = Number.isNaN(lastContact);
      const stale = !missing && nowMs - lastContact > staleMs;
      if (missing || stale) {
        candidates.push({
          client_id: snapshot.client_id,
          client_name: clientName,
          rule_type: "no_contact",
          fingerprint: legacyRuleFingerprint(
            "no_contact",
            snapshot.client_id,
            missing ? "missing" : `last:${jerusalemYmd(new Date(lastContact))}`,
          ),
          message: [
            "🟡 *התראת דופק — אין עדכון קשר*",
            `לקוח: ${clientName}`,
            missing
              ? `לא תועדה שיחה/פגישה ב-${days} הימים האחרונים`
              : `עדכון קשר אחרון: ${new Date(lastContact).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
            "",
            "AIOS → דשבורד דופק",
          ].join("\n"),
        });
      }
    }

    // Legacy snapshots do not have campaign evidence. Once campaign_breakdown
    // exists, target-aware campaign exceptions replace raw CPL-spike alerts.
    if (rules.cpl_spike_enabled && campaignBreakdown.length === 0) {
      const threshold = rules.cpl_spike_pct ?? 50;
      const change = snapshot.cpl_change_pct;
      if (
        change !== null &&
        change !== undefined &&
        Number(change) >= threshold
      ) {
        candidates.push({
          client_id: snapshot.client_id,
          client_name: clientName,
          rule_type: "cpl_spike",
          fingerprint: legacyRuleFingerprint(
            "cpl_spike",
            snapshot.client_id,
            "spike",
          ),
          message: [
            "🔴 *התראת דופק — עליית CPL*",
            `לקוח: ${clientName}`,
            `CPL עלה ב-${Math.round(Number(change) * 10) / 10}% לעומת השבוע הקודם`,
            "",
            "AIOS → דשבורד דופק",
          ].join("\n"),
        });
      }
    }

    if (rules.disconnected_enabled) {
      // Real connection loss: no connected table or a stale/missing sync.
      const isLostConnectionFlag = (flag: string) =>
        flag.includes("אין טבלת קמפיין") || flag.includes("סנכרון ישן");
      const connectionFlags = flags.filter(
        (flag) =>
          isLostConnectionFlag(flag) ||
          flag.includes("קמפיין נעצר") ||
          flag.includes("קמפיינים נעצרו"),
      );
      const statusNoData =
        snapshot.status === "no_data" ||
        snapshot.lead_goal_status === "no_data" ||
        snapshot.ecommerce_goal_status === "no_data";
      const noDataWithoutTable =
        statusNoData && flags.some((flag) => flag.includes("אין טבלת"));
      const critical = criticalByClient.get(snapshot.client_id) || [];
      const criticalLabels = critical.map((issue) => {
        if (issue.alertType === "campaign_stopped") return "קמפיין הושהה/נעצר";
        if (issue.alertType === "ad_disapproved") return "מודעה לא מאושרת";
        return issue.alertType || "בעיית קמפיין";
      });
      // An open account-level stop/disable (e.g. account_disabled) is critical
      // (critical-alerts.ts); campaign_stopped / ad_disapproved are not.
      const criticalAccountIssue = critical.some((issue) =>
        isCriticalAlert(issue.alertType),
      );

      const hasConnectionIssue =
        connectionFlags.length > 0 ||
        criticalLabels.length > 0 ||
        noDataWithoutTable;

      if (hasConnectionIssue) {
        const detail = [
          ...connectionFlags.slice(0, 2),
          ...criticalLabels.slice(0, 2),
        ].filter(Boolean);
        candidates.push({
          client_id: snapshot.client_id,
          client_name: clientName,
          rule_type: "connection_lost",
          // One open finding per client: the issue mix (stale sync, stopped
          // campaign, missing table) flaps between runs and must not resend.
          fingerprint: legacyRuleFingerprint(
            "connection_lost",
            snapshot.client_id,
            "open",
          ),
          shabbat_critical:
            connectionFlags.some(isLostConnectionFlag) ||
            noDataWithoutTable ||
            criticalAccountIssue,
          message: [
            "🔴 *התראת דופק — חיבור/קמפיין*",
            `לקוח: ${clientName}`,
            detail.length ? detail.join(" · ") : "דוח מנותק / חשבון לא פעיל",
            "",
            "AIOS → דשבורד דופק",
          ].join("\n"),
        });
      }
    }
  }

  return candidates;
}

async function recentAlertDeliveries(
  supabase: any,
  tenantId: string,
  clientId: string,
  ruleType: PulseAlertRuleType,
  throttleHours: number,
  nowMs: number,
  campaignKey?: string | null,
): Promise<InstantAlertLogRow[] | null> {
  const since = new Date(nowMs - throttleHours * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("pulse_instant_alert_log")
    .select("fingerprint, severity_score")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("rule_type", ruleType)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(50);
  if (campaignKey) query = query.eq("campaign_key", campaignKey);
  const { data, error } = await query;
  if (error) {
    console.warn("[pulse-instant-alerts] dedupe lookup failed", error.message);
    return null;
  }
  return data || [];
}

async function resolveInstantAlertRecipients(
  supabase: any,
  tenantId: string,
  clientId: string,
  agencyId: string | null | undefined,
  pulsePhone: string | null | undefined,
  tenantSlug?: string | null,
): Promise<Array<{ phone: string; label: string }>> {
  const recipients = new Map<string, string>();

  const pulse = normalizeNotifyPhone(pulsePhone);
  if (pulse && !isPulseDeliveryExcludedPhone(pulse, tenantSlug)) {
    recipients.set(pulse, "owner");
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "agency_owner", "team_manager"]);
  const ownerIds = (roles || [])
    .filter((row: any) => row.role === "owner" || row.role === "agency_owner")
    .map((row: any) => row.user_id)
    .filter(Boolean);
  let managerIds = (roles || [])
    .filter((row: any) => row.role === "team_manager")
    .map((row: any) => row.user_id)
    .filter(Boolean);
  if (agencyId && managerIds.length) {
    const { data: managed } = await supabase
      .from("user_managed_agencies")
      .select("user_id")
      .eq("agency_id", agencyId)
      .in("user_id", managerIds);
    const allowed = new Set((managed || []).map((row: any) => row.user_id));
    managerIds = managerIds.filter((id: string) => allowed.has(id));
  }
  const recipientUserIds = Array.from(new Set([...ownerIds, ...managerIds]));
  if (recipientUserIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, campaigners ( phone )")
      .in("id", recipientUserIds);
    for (const profile of profiles || []) {
      const phone = normalizeNotifyPhone(profile.campaigners?.phone);
      if (!phone || isPulseDeliveryExcludedPhone(phone, tenantSlug)) continue;
      recipients.set(phone, profile.full_name || "manager");
    }
  }

  return Array.from(recipients.entries()).map(([phone, label]) => ({
    phone,
    label,
  }));
}

/**
 * Shabbat policy for one candidate: non-critical rules wait, and so does a
 * connection_lost that is only single-campaign issues (shabbat_critical false).
 */
export function isPulseAlertHeldForShabbat(
  candidate: Pick<PulseInstantAlertCandidate, "rule_type" | "shabbat_critical">,
  now: Date = new Date(),
): boolean {
  if (!isJerusalemShabbat(now)) return false;
  return (
    isAlertHeldForShabbat(candidate.rule_type, now) ||
    candidate.shabbat_critical !== true
  );
}

export async function deliverInstantPulseAlerts(input: {
  supabase: any;
  tenantId: string;
  tenantSlug?: string | null;
  pulsePhone?: string | null;
  snapshots: PulseSnapshotAlertInput[];
  criticalIssues: CriticalIssueLike[];
  rules: unknown;
  queueWhatsApp: QueueWhatsApp;
  /**
   * Optional wording for campaign_exception alerts. It never decides whether
   * an alert is sent; see wordPulseException.
   */
  phraseException?: PhrasePulseException;
  /** Wording timeout override for tests. */
  wordingTimeoutMs?: number;
  /** Clock override for tests. */
  now?: Date;
}): Promise<InstantPulseAlertResult> {
  const now = input.now ?? new Date();
  const evaluated = evaluatePulseInstantAlerts(
    input.snapshots,
    input.criticalIssues,
    input.rules,
    now.getTime(),
  );
  // Shabbat: only a real connection loss goes out. The rest are not logged,
  // so the first run after Shabbat re-evaluates and sends them once.
  const candidates = evaluated.filter(
    (candidate) => !isPulseAlertHeldForShabbat(candidate, now),
  );
  const held = evaluated.length - candidates.length;
  if (!candidates.length)
    return {
      sent: 0,
      skipped: 0,
      candidates: evaluated.length,
      wording_calls: 0,
      worded: 0,
      held,
    };

  let sent = 0;
  let skipped = 0;
  let wordingCalls = 0;
  let worded = 0;

  for (const candidate of candidates) {
    const throttleHours = RULE_THROTTLE_HOURS[candidate.rule_type];
    const recent = await recentAlertDeliveries(
      input.supabase,
      input.tenantId,
      candidate.client_id,
      candidate.rule_type,
      throttleHours,
      now.getTime(),
      candidate.campaign_key,
    );
    // A failed dedupe lookup must not turn into a resend.
    if (
      recent === null ||
      !decideInstantAlertDelivery(candidate, recent).send
    ) {
      skipped += 1;
      continue;
    }

    const recipients = await resolveInstantAlertRecipients(
      input.supabase,
      input.tenantId,
      candidate.client_id,
      input.snapshots.find(
        (snapshot) => snapshot.client_id === candidate.client_id,
      )?.agency_id,
      input.pulsePhone,
      input.tenantSlug,
    );
    if (!recipients.length) {
      skipped += 1;
      continue;
    }

    let wordingApplied = false;
    if (candidate.rule_type === "campaign_exception") {
      // The deterministic checks above decide delivery (AIO-243). The model
      // may only add wording; it cannot stop the alert, and a failure or
      // timeout sends the deterministic text and moves on.
      const wording = await wordPulseException(
        candidate,
        input.phraseException,
        input.wordingTimeoutMs,
      );
      if (wording.called) wordingCalls += 1;
      wordingApplied = wording.ai_wording.applied;
      candidate.message = wording.message;
      candidate.evidence = {
        ...(candidate.evidence || {}),
        ai_wording: wording.ai_wording,
      };
    }

    let delivered = false;
    for (const recipient of recipients) {
      const queued = await input.queueWhatsApp(
        candidate.message,
        recipient.phone,
      );
      if (queued) delivered = true;
    }
    if (delivered) {
      sent += 1;
      if (wordingApplied) worded += 1;
      await input.supabase.from("pulse_instant_alert_log").insert({
        tenant_id: input.tenantId,
        client_id: candidate.client_id,
        rule_type: candidate.rule_type,
        message: candidate.message,
        recipient_phone: recipients.map((row) => row.phone).join(","),
        campaign_key: candidate.campaign_key || null,
        fingerprint: candidate.fingerprint || null,
        severity_score: candidate.severity_score || null,
        evidence: candidate.evidence || {},
      });
    } else {
      skipped += 1;
    }
  }

  return {
    sent,
    skipped,
    candidates: evaluated.length,
    wording_calls: wordingCalls,
    worded,
    held,
  };
}

export type InstantPulseAlertResult = {
  sent: number;
  skipped: number;
  candidates: number;
  /** Model wording calls made for campaign_exception alerts. */
  wording_calls: number;
  /** Alerts sent with model wording added to the deterministic text. */
  worded: number;
  /** Non-critical candidates held for Shabbat (re-evaluated after it). */
  held: number;
  /** Why the run sent nothing at all, when the gate stopped it. */
  suppressed?: Exclude<InstantPulseAlertsGate["reason"], null>;
};

/** campaign-pulse-snapshot entry point: applies the gate, then delivers. */
export async function runGatedInstantPulseAlerts(
  gate: InstantPulseAlertsGate,
  input: Parameters<typeof deliverInstantPulseAlerts>[0],
): Promise<InstantPulseAlertResult> {
  if (!gate.run) {
    return {
      sent: 0,
      skipped: 0,
      candidates: 0,
      wording_calls: 0,
      worded: 0,
      held: 0,
      suppressed: gate.reason,
    };
  }
  return await deliverInstantPulseAlerts(input);
}
