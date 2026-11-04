/** An open disconnect as pulse_open_integration_disconnects returns it, for the pulse tests. */
import type { OpenIntegrationDisconnect } from "./connection-disconnects.ts";

/** Google Ads lost on Wednesday 4.11.2026 at 12:25 Israel time. */
export function adsDisconnect(
  overrides: Partial<OpenIntegrationDisconnect> = {},
): OpenIntegrationDisconnect {
  return {
    event_id: "event-1",
    integration_id: "conn-1",
    integration_type: "google_ads",
    provider_label: "Google Ads",
    account_label: "ads@dmm.example",
    disconnected_at: "2026-11-04T10:25:00Z",
    report_tables: 3,
    shared_with_tenants: ["MarketingCaptain"],
    ...overrides,
  };
}
