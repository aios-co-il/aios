/**
 * Instant WhatsApp alerts from campaign pulse snapshots.
 * Scoped owner + responsible team managers receive per-campaign alerts (deduped).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { isPulseDeliveryExcludedPhone } from "./campaign-pulse.ts";
import { normalizeNotifyPhone } from "./carmen-notify-target.ts";
import type { Json } from "./database.types.ts";
import {
  isLostConnectionFlag,
  isNoDataWithoutTable,
  isRealConnectionLoss,
} from "./pulse/connection-loss.ts";
import { PULSE_ALERT_FOOTER } from "./pulse/alert-footer.ts";
import {
  connectionLostFingerprint,
  cplSpikeFingerprint,
  noContactFingerprint,
} from "./pulse/instant-alert-fingerprint.ts";
import { isPulseAlertHeldForShabbat } from "./pulse/instant-alert-shabbat.ts";
import {
  capExceptionMessages,
  parsePulseInstantRunRules,
  type PulseInstantRunRules,
} from "./pulse/exception-flood-guard.ts";
import { sendExceptionSummaries } from "./pulse/exception-summary.ts";
import {
  DEFAULT_EXCEPTION_CHECK_LINE,
  type PhrasePulseException,
} from "./pulse/exception-wording.ts";
import { sendIndividualAlerts } from "./pulse/individual-alerts.ts";
import { planInstantAlerts } from "./pulse/plan-instant-alerts.ts";

export type PulseAlertRuleType =
  "no_contact" | "cpl_spike" | "connection_lost" | "campaign_exception";

export type PulseAlertRules = {
  instant_wa_enabled?: boolean;
  no_contact_enabled?: boolean;
  no_contact_days?: number;
  cpl_spike_enabled?: boolean;
  cpl_spike_pct?: number;
  disconnected_enabled?: boolean;
  instant: PulseInstantRunRules;
};

export const DEFAULT_PULSE_ALERT_RULES: PulseAlertRules = {
  instant_wa_enabled: true,
  no_contact_enabled: true,
  no_contact_days: 14,
  cpl_spike_enabled: true,
  cpl_spike_pct: 50,
  disconnected_enabled: true,
  instant: parsePulseInstantRunRules(undefined),
};

export type PulseInstantAlertCandidate = {
  client_id: string;
  client_name: string;
  rule_type: PulseAlertRuleType;
  message: string;
  campaign_key?: string | null;
  fingerprint?: string | null;
  severity_score?: number | null;
  evidence?: { [key: string]: Json | undefined };
  /**
   * campaign_exception only: the labels a per-run summary line shows. They
   * stay out of evidence, so digits in a name never license a model number.
   */
  campaign_name?: string | null;
  status_reason?: string | null;
  /** connection_lost only: may go out on Shabbat (see isRealConnectionLoss). */
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

export type QueueWhatsApp = (
  message: string,
  chatId: string | null,
) => Promise<boolean>;

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
    instant: parsePulseInstantRunRules(input.instant),
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
      const campaignName = campaign.campaign_name || campaign.campaign_key;
      const statusReason = campaign.status_reason || "חריגה מתמשכת";
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
        campaign_name: campaignName,
        status_reason: statusReason,
        fingerprint,
        severity_score: severity,
        evidence,
        message: [
          "🔴 *התראת דופק — חריגת קמפיין מאומתת*",
          `לקוח: ${clientName}`,
          `קמפיין: ${campaignName}`,
          `קטגוריה: ${campaign.goal || "לא מסווג"}`,
          `סיבה: ${statusReason}`,
          `יעד: ${target}`,
          `3 ימים: ${campaign.efficiency_3d ?? "חסר"} · 7 ימים: ${campaign.efficiency_7d ?? "חסר"}`,
          `שינוי אחרון: ${campaign.last_change_at || "לא זמין"}`,
          `נתונים עד: ${campaign.data_fresh_through || "לא זמין"}`,
          "",
          DEFAULT_EXCEPTION_CHECK_LINE,
          PULSE_ALERT_FOOTER,
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
          fingerprint: noContactFingerprint(snapshot.client_id, lastContact),
          message: [
            "🟡 *התראת דופק — אין עדכון קשר*",
            `לקוח: ${clientName}`,
            missing
              ? `לא תועדה שיחה/פגישה ב-${days} הימים האחרונים`
              : `עדכון קשר אחרון: ${new Date(lastContact).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
            "",
            PULSE_ALERT_FOOTER,
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
          fingerprint: cplSpikeFingerprint(snapshot.client_id),
          message: [
            "🔴 *התראת דופק — עליית CPL*",
            `לקוח: ${clientName}`,
            `CPL עלה ב-${Math.round(Number(change) * 10) / 10}% לעומת השבוע הקודם`,
            "",
            PULSE_ALERT_FOOTER,
          ].join("\n"),
        });
      }
    }

    if (rules.disconnected_enabled) {
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
      const critical = criticalByClient.get(snapshot.client_id) || [];
      const criticalLabels = critical.map((issue) => {
        if (issue.alertType === "campaign_stopped") return "קמפיין הושהה/נעצר";
        if (issue.alertType === "ad_disapproved") return "מודעה לא מאושרת";
        return issue.label || "בעיית קמפיין";
      });

      const hasConnectionIssue =
        connectionFlags.length > 0 ||
        criticalLabels.length > 0 ||
        isNoDataWithoutTable(statusNoData, flags);

      if (hasConnectionIssue) {
        const detail = [
          ...connectionFlags.slice(0, 2),
          ...criticalLabels.slice(0, 2),
        ].filter(Boolean);
        candidates.push({
          client_id: snapshot.client_id,
          client_name: clientName,
          rule_type: "connection_lost",
          fingerprint: connectionLostFingerprint(snapshot.client_id),
          shabbat_critical: isRealConnectionLoss(flags, statusNoData, critical),
          message: [
            "🔴 *התראת דופק — חיבור/קמפיין*",
            `לקוח: ${clientName}`,
            detail.length ? detail.join(" · ") : "דוח מנותק / חשבון לא פעיל",
            "",
            PULSE_ALERT_FOOTER,
          ].join("\n"),
        });
      }
    }
  }

  return candidates;
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

/** One org's run of instant alerts. */
export type InstantPulseAlertsInput = {
  supabase: any;
  tenantId: string;
  tenantSlug?: string | null;
  pulsePhone?: string | null;
  snapshots: PulseSnapshotAlertInput[];
  criticalIssues: CriticalIssueLike[];
  rules: unknown;
  queueWhatsApp: QueueWhatsApp;
  /** Optional wording for campaign_exception alerts; see wordPulseException. */
  phraseException?: PhrasePulseException;
  /** Wording timeout override for tests. */
  wordingTimeoutMs?: number;
  /** Clock override for tests. */
  now?: Date;
};

/**
 * Sends a run's instant alerts: plan what goes out, cap campaign_exception
 * messages per phone, send the individual messages, then the summaries.
 */
export async function deliverInstantPulseAlerts(
  input: InstantPulseAlertsInput,
): Promise<{
  /** Alerts sent as their own message. */
  sent: number;
  skipped: number;
  /**
   * campaign_exception alerts over a recipient's per-run cap that went out
   * only inside a summary message; logged like sent ones.
   */
  summarized: number;
  /** Summary messages queued: at most one per recipient phone per run. */
  summary_messages: number;
  candidates: number;
  /** Model wording calls made for campaign_exception alerts. */
  wording_calls: number;
  /** Alerts sent with model wording added to the deterministic text. */
  worded: number;
  /** Non-critical candidates held for Shabbat (re-evaluated after it). */
  held: number;
}> {
  const now = input.now ?? new Date();
  const evaluated = evaluatePulseInstantAlerts(
    input.snapshots,
    input.criticalIssues,
    input.rules,
    now.getTime(),
  );
  const candidates = evaluated.filter(
    (candidate) => !isPulseAlertHeldForShabbat(candidate, now),
  );
  const plan = await planInstantAlerts(
    input,
    candidates,
    now,
    (candidate, agencyId) =>
      resolveInstantAlertRecipients(
        input.supabase,
        input.tenantId,
        candidate.client_id,
        agencyId,
        input.pulsePhone,
        input.tenantSlug,
      ),
  );
  const summaryByPhone = capExceptionMessages(
    plan.planned,
    parsePulseAlertRules(input.rules).instant.max_exception_messages_per_run,
  );
  const individual = await sendIndividualAlerts(input, plan.planned);
  const summary = await sendExceptionSummaries(input, summaryByPhone);
  const undelivered = plan.planned.filter(
    (item) => !item.sentTo.length && !item.summarizedTo.length,
  ).length;
  return {
    sent: individual.sent,
    skipped: plan.skipped + undelivered,
    summarized: summary.summarized,
    summary_messages: summary.summary_messages,
    candidates: evaluated.length,
    wording_calls: individual.wording_calls,
    worded: individual.worded,
    held: evaluated.length - candidates.length,
  };
}
