import {
  deliverInstantPulseAlerts,
  parsePulseAlertRules,
} from "../_shared/pulse-instant-alerts.ts";

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

export type InstantPulseAlertResult = Awaited<
  ReturnType<typeof deliverInstantPulseAlerts>
> & {
  /** Why the run sent nothing at all, when the gate stopped it. */
  suppressed?: Exclude<InstantPulseAlertsGate["reason"], null>;
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
  if (body.skip_instant_alerts === true) {
    return { run: false, reason: "skip_instant_alerts" };
  }
  if (body.preview_only === true) {
    return { run: false, reason: "preview_only" };
  }
  if (body.source === "approved_manual_trigger") {
    return { run: false, reason: "manual_trigger" };
  }
  if (input.campaignPulseEnabled !== true) {
    return { run: false, reason: "pulse_disabled" };
  }
  if (
    !input.rules ||
    typeof input.rules !== "object" ||
    parsePulseAlertRules(input.rules).instant_wa_enabled !== true
  ) {
    return { run: false, reason: "instant_wa_disabled" };
  }
  return { run: true, reason: null };
}

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
      analyzed: 0,
      held: 0,
      suppressed: gate.reason,
    };
  }
  return await deliverInstantPulseAlerts(input);
}
