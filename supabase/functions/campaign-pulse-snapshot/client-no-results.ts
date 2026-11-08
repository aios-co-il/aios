import {
  type CampaignGoal,
  computeGoalMetricsFromRecords,
} from "../_shared/campaign-pulse.ts";
import {
  type ClientNoResultsWindow,
  noResultsWindowStart,
  resolveNoResultsDays,
} from "../_shared/pulse/no-results-window.ts";
import { recordsThrough } from "./client-windows.ts";

/** A client row as the snapshot selects it, with its no-results days (AIO-502). */
export type NoResultsClient = {
  id: string;
  pulse_no_results_days?: number | null;
};

/**
 * The client's clients.pulse_no_results_days for buildPulseCampaignRows, read
 * the way the rows read it: missing or null is the default 7.
 */
export function noResultsDaysByClientOf(
  client: NoResultsClient,
): Record<string, number> {
  return { [client.id]: resolveNoResultsDays(client.pulse_no_results_days) };
}

/**
 * The client's no-results window for the client-level status: its days and
 * the goal's results in them, through the last full day, so the client status
 * holds a 7-day streak exactly as the campaign rows do.
 */
export function clientNoResultsWindow(
  client: NoResultsClient,
  records: Array<{ table_id?: string; data?: Record<string, unknown> | null }>,
  goal: CampaignGoal,
  lastFullDay: string,
): ClientNoResultsWindow {
  const days = resolveNoResultsDays(client.pulse_no_results_days);
  const start = noResultsWindowStart(lastFullDay, days);
  const totals = computeGoalMetricsFromRecords(
    recordsThrough(records, lastFullDay),
    goal,
    start,
    start,
  );
  return { days, outcomes: totals.outcomes };
}
