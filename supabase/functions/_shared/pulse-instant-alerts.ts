/**
 * Instant WhatsApp alerts from campaign pulse snapshots.
 * Everyone the organization's Carmen reports to, its owners and agency owners,
 * and the team managers of the client's agency receive the run's alerts
 * (deduped), as one message per phone per run.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CarmenReportRecipient } from "./carmen-report-recipients/resolve.ts";
import {
  exceptionFiguresText,
  spentWithoutResults3d,
} from "./pulse/instant-alert-lines.ts";
import type { Json } from "./database.types.ts";
import {
  isLostConnectionFlag,
  isNoDataWithoutTable,
  isRealConnectionLoss,
} from "./pulse/connection-loss.ts";
import {
  connectionLostFingerprint,
  cplSpikeFingerprint,
  noContactFingerprint,
} from "./pulse/instant-alert-fingerprint.ts";
import { isPulseAlertHeldForShabbat } from "./pulse/instant-alert-shabbat.ts";
import { sendRunMessages } from "./pulse/instant-alert-send.ts";
import { resolveInstantAlertRecipients } from "./pulse/instant-alert-recipients.ts";
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
  /** The alert's line in its section of the run message, built by code. */
  line: string;
  campaign_key?: string | null;
  fingerprint?: string | null;
  severity_score?: number | null;
  evidence?: { [key: string]: Json | undefined };
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
    /** "approved" (default) or "carmen_market" — named in the alert text. */
    target_source?: string | null;
    efficiency_3d?: number | null;
    efficiency_7d?: number | null;
    spend_3d?: number | null;
    outcomes_3d?: number | null;
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
  /** The alert type's Hebrew label (selectPulseCriticalAlerts). */
  label?: string | null;
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
        target_source: campaign.target_source ?? null,
        efficiency_3d: campaign.efficiency_3d ?? null,
        efficiency_7d: campaign.efficiency_7d ?? null,
        spend_3d: campaign.spend_3d ?? null,
        outcomes_3d: campaign.outcomes_3d ?? null,
        no_results_3d: spentWithoutResults3d(campaign),
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
        line: [
          clientName,
          campaignName,
          statusReason,
          exceptionFiguresText(campaign),
        ].join(" — "),
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
          line: `${clientName} — ${
            missing
              ? "לא תועד"
              : `קשר אחרון: ${new Date(lastContact).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`
          }`,
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
          line: `${clientName} — CPL עלה ב-${Math.round(Number(change) * 10) / 10}% לעומת השבוע הקודם`,
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
          line: `${clientName} — ${
            detail.length ? detail.join(" · ") : "דוח מנותק / חשבון לא פעיל"
          }`,
        });
      }
    }
  }

  return candidates;
}

/** One org's run of instant alerts. */
export type InstantPulseAlertsInput = {
  supabase: any;
  tenantId: string;
  tenantSlug?: string | null;
  /** The organization's name, in the header of each run message. */
  orgName: string;
  /** Whom the organization's Carmen reports to; alerted ahead of the owners and managers. */
  reportRecipients: CarmenReportRecipient[];
  snapshots: PulseSnapshotAlertInput[];
  criticalIssues: CriticalIssueLike[];
  rules: unknown;
  queueWhatsApp: QueueWhatsApp;
  /** Clock override for tests. */
  now?: Date;
};

/**
 * Sends a run's instant alerts (AIO-290): plan what goes out, then queue one
 * message per recipient phone with every alert planned for it.
 */
export async function deliverInstantPulseAlerts(
  input: InstantPulseAlertsInput,
): Promise<{
  /** Alerts that reached at least one phone, each logged. */
  sent: number;
  skipped: number;
  /** Run messages queued: at most one per recipient phone. */
  messages: number;
  candidates: number;
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
  // Dedupe is per phone, so every candidate needs its recipients: read them
  // once per agency in the run.
  const recipientsByAgency = new Map<
    string,
    ReturnType<typeof resolveInstantAlertRecipients>
  >();
  const plan = await planInstantAlerts(
    input,
    candidates,
    now,
    (_candidate, agencyId) => {
      const key = agencyId ?? "";
      const recipients =
        recipientsByAgency.get(key) ??
        resolveInstantAlertRecipients(
          input.supabase,
          input.tenantId,
          agencyId,
          input.reportRecipients,
          input.tenantSlug,
        );
      recipientsByAgency.set(key, recipients);
      return recipients;
    },
  );
  const { messages } = await sendRunMessages(input, plan.planned, now);
  const sent = plan.planned.filter((item) => item.sentTo.length).length;
  return {
    sent,
    skipped: plan.skipped + plan.planned.length - sent,
    messages,
    candidates: evaluated.length,
    held: evaluated.length - candidates.length,
  };
}
