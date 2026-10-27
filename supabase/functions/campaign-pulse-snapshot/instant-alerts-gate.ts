import {
  deliverInstantPulseAlerts,
  parsePulseAlertRules,
} from "../_shared/pulse-instant-alerts.ts";
import { PULSE_MANUAL_TRIGGER_SOURCE } from "../_shared/pulse/manual-trigger-source.ts";

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

type InstantPulseAlertResult = Awaited<
  ReturnType<typeof deliverInstantPulseAlerts>
> & {
  /** Why the run sent nothing at all, when the gate stopped it. */
  suppressed?: Exclude<InstantPulseAlertsGate["reason"], null>;
};

/** The tenant_heartbeat_settings fields the gate reads. */
type PulseAlertSetting = {
  campaign_pulse_enabled?: unknown;
  pulse_alert_rules?: unknown;
};

/** The campaign-pulse-snapshot request body. */
type SnapshotRequest = Record<string, unknown> | null | undefined;

/**
 * campaign-pulse-snapshot's way to send instant alerts: applies the gate to
 * the tenant's setting and the request, then delivers.
 */
export async function gatedInstantAlerts(
  setting: PulseAlertSetting,
  body: SnapshotRequest,
  input: Parameters<typeof deliverInstantPulseAlerts>[0],
): Promise<InstantPulseAlertResult> {
  const gate = instantPulseAlertsGate(setting, body);
  if (!gate.run) {
    return { ...noInstantAlerts(), suppressed: gate.reason };
  }
  return await deliverInstantPulseAlerts(input);
}

/** The result when no instant alert ran (no snapshots, or delivery threw). */
export function noInstantAlerts(): InstantPulseAlertResult {
  return { sent: 0, skipped: 0, candidates: 0, analyzed: 0, held: 0 };
}

/**
 * Instant alerts run on a snapshot refresh only when the tenant has the pulse
 * on, the instant WhatsApp switch on, and the request is a real refresh: not a
 * preview, not the manual trigger, and not a caller that asked for a refresh
 * without alerts (`skip_instant_alerts: true`).
 */
export function instantPulseAlertsGate(
  setting: PulseAlertSetting,
  body: SnapshotRequest,
): InstantPulseAlertsGate {
  const request = body || {};
  if (request.skip_instant_alerts === true) {
    return { run: false, reason: "skip_instant_alerts" };
  }
  if (request.preview_only === true) {
    return { run: false, reason: "preview_only" };
  }
  if (request.source === PULSE_MANUAL_TRIGGER_SOURCE) {
    return { run: false, reason: "manual_trigger" };
  }
  if (setting.campaign_pulse_enabled !== true) {
    return { run: false, reason: "pulse_disabled" };
  }
  const rules = setting.pulse_alert_rules;
  if (
    !rules ||
    typeof rules !== "object" ||
    parsePulseAlertRules(rules).instant_wa_enabled !== true
  ) {
    return { run: false, reason: "instant_wa_disabled" };
  }
  return { run: true, reason: null };
}
