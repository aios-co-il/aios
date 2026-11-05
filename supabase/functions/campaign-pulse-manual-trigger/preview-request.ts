import { PULSE_MANUAL_TRIGGER_SOURCE } from "../_shared/pulse/manual-trigger-source.ts";

/**
 * The campaign-pulse-snapshot request for one approved tenant's digest
 * preview. skip_instant_alerts: a digest preview must never fire instant
 * alerts to the team.
 */
export function manualPreviewRequest(tenantId: string) {
  return {
    tenant_id: tenantId,
    deliver: true,
    force_delivery: true,
    preview_only: true,
    skip_instant_alerts: true,
    source: PULSE_MANUAL_TRIGGER_SOURCE,
  };
}
