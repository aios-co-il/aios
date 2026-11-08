/**
 * How many people did each followed site event, by session source / medium
 * and in total, and how many of those who did one step went on to the next.
 * People are GA's totalUsers for the selected dates, counted once per
 * period, so they cannot come from the sync's daily rows. The step rates
 * come from GA's funnel report (closed funnel: each step counts only people
 * who did the steps before it).
 */
import type { TrackedEvent } from "./tracked-events.ts";

/** How many sources get a row of their own. */
export const TOP_SOURCES = 8;

/** One row of the table: people per event and the step-to-step rate. */
export type EventUsersRow = {
  source: string;
  /** People who did each event in the period, by event name. */
  users: Record<string, number>;
  /**
   * Of the people who did the previous step, the share who did this one, by
   * event name; null for the first step or when the funnel report failed.
   */
  stepRates: Record<string, number | null>;
};

export type EventUsersResult = {
  steps: Array<TrackedEvent>;
  total: EventUsersRow;
  sources: Array<EventUsersRow>;
  /** False when GA's funnel report failed and the rates are missing. */
  funnelAvailable: boolean;
  /** The dashboard's conversion pair as a closed funnel; null without one. */
  pair?: PairUsers | null;
};

/** People at the pair's first event and, of them, at its second. */
export type PairUsers = { from: number; to: number };

/** One GA report row as the Data API returns it. */
export type GaRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

/** People per event from the users report without a source. */
export function usersByEvent(rows: Array<GaRow> | undefined) {
  const users: Record<string, number> = {};
  for (const row of rows ?? []) {
    const event = row.dimensionValues?.[0]?.value ?? "";
    users[event] = (users[event] ?? 0) + toNumber(row.metricValues?.[0]?.value);
  }
  return users;
}

/** People per source and event from the users report by source. */
export function usersBySource(rows: Array<GaRow> | undefined) {
  const bySource = new Map<string, Record<string, number>>();
  for (const row of rows ?? []) {
    const event = row.dimensionValues?.[0]?.value ?? "";
    const source = row.dimensionValues?.[1]?.value || "(not set)";
    const users = bySource.get(source) ?? {};
    users[event] = (users[event] ?? 0) + toNumber(row.metricValues?.[0]?.value);
    bySource.set(source, users);
  }
  return bySource;
}

/**
 * People at each funnel step, per breakdown value ("" without a breakdown).
 * Step dimension values read "1. ticket_upload"; the funnel table's total
 * rows under a breakdown read "RESERVED_TOTAL" and are skipped.
 */
export function funnelStepUsers(
  rows: Array<GaRow> | undefined,
  steps: Array<TrackedEvent>,
  bySource: boolean,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const row of rows ?? []) {
    const stepLabel = row.dimensionValues?.[0]?.value ?? "";
    const breakdown = bySource ? (row.dimensionValues?.[1]?.value ?? "") : "";
    if (breakdown === "RESERVED_TOTAL") {
      continue;
    }
    const step = steps.find(
      (item, index) =>
        stepLabel === `${index + 1}. ${item.event}` || stepLabel === item.event,
    );
    if (!step) {
      continue;
    }
    const users = out.get(breakdown) ?? {};
    users[step.event] = toNumber(row.metricValues?.[0]?.value);
    out.set(breakdown, users);
  }
  return out;
}

/** Each step's share of the step before it; null for the first or without data. */
export function stepRatesOf(
  steps: Array<TrackedEvent>,
  stepUsers: Record<string, number> | undefined,
): Record<string, number | null> {
  const rates: Record<string, number | null> = {};
  steps.forEach((step, index) => {
    const previous =
      index > 0 ? stepUsers?.[steps[index - 1].event] : undefined;
    const current = stepUsers?.[step.event];
    rates[step.event] =
      index === 0 || !stepUsers || !previous || current === undefined
        ? null
        : current / previous;
  });
  return rates;
}

/**
 * The table: the total row, then the sources that brought the most people to
 * the first step (ties by all people), each with its own step rates.
 */
export function buildEventUsers(input: {
  steps: Array<TrackedEvent>;
  totalUsers: Record<string, number>;
  sourceUsers: Map<string, Record<string, number>>;
  totalFunnel: Map<string, Record<string, number>> | null;
  sourceFunnel: Map<string, Record<string, number>> | null;
}): EventUsersResult {
  const { steps, totalUsers, sourceUsers, totalFunnel, sourceFunnel } = input;
  const first = steps[0]?.event ?? "";
  const sum = (users: Record<string, number>) =>
    Object.values(users).reduce((a, b) => a + b, 0);
  const sources = [...sourceUsers.entries()]
    .sort(
      ([, a], [, b]) => (b[first] ?? 0) - (a[first] ?? 0) || sum(b) - sum(a),
    )
    .slice(0, TOP_SOURCES)
    .map(([source, users]) => ({
      source,
      users,
      stepRates: stepRatesOf(steps, sourceFunnel?.get(source)),
    }));
  return {
    steps,
    total: {
      source: "סה״כ",
      users: totalUsers,
      stepRates: stepRatesOf(steps, totalFunnel?.get("")),
    },
    sources,
    funnelAvailable: totalFunnel !== null,
  };
}

/** A GA metric value as a number. */
function toNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
