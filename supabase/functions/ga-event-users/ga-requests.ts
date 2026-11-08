/**
 * The GA Data API requests behind the event-users table: people per event
 * (runReport) and the closed funnel over the steps (runFunnelReport).
 */
import { TOP_SOURCES } from "./reports.ts";
import type { TrackedEvent } from "./tracked-events.ts";

/** A run of the users report: people per event, optionally by source. */
export function usersRequest(
  steps: Array<TrackedEvent>,
  startDate: string,
  endDate: string,
  bySource: boolean,
) {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: bySource
      ? [{ name: "eventName" }, { name: "sessionSourceMedium" }]
      : [{ name: "eventName" }],
    metrics: [{ name: "totalUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: steps.map((step) => step.event) },
      },
    },
    limit: 5000,
  };
}

/** GA's funnel report over the steps in order, optionally broken down by source. */
export function funnelRequest(
  steps: Array<TrackedEvent>,
  startDate: string,
  endDate: string,
  bySource: boolean,
) {
  return {
    dateRanges: [{ startDate, endDate }],
    funnel: {
      isOpenFunnel: false,
      steps: steps.map((step) => ({
        name: step.event,
        filterExpression: { funnelEventFilter: { eventName: step.event } },
      })),
    },
    ...(bySource
      ? {
          funnelBreakdown: {
            breakdownDimension: { name: "sessionSourceMedium" },
            limit: TOP_SOURCES,
          },
        }
      : {}),
  };
}
