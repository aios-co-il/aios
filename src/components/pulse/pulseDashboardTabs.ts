/** The pulse dashboard's tabs: raw data, attention matrix, campaigns without a target. */
export const PULSE_DASHBOARD_TABS = ["data", "attention", "no_target"] as const;

/** One of the pulse dashboard's tabs. */
export type PulseDashboardTab = (typeof PULSE_DASHBOARD_TABS)[number];

/** Is this value one of the pulse dashboard's tabs? */
export function isPulseDashboardTab(value: string): value is PulseDashboardTab {
  return PULSE_DASHBOARD_TABS.some((tab) => tab === value);
}
