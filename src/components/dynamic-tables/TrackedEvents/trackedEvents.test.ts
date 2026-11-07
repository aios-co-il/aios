import { describe, expect, it } from "vitest";
import {
  availableEventNames,
  parseTrackedEvents,
  summarizeTrackedEvents,
  type TrackedEventRecord,
} from "./trackedEvents";

const ga = (
  date: string,
  event_name: string,
  event_count: number,
  key_events = 0,
): TrackedEventRecord => ({
  _source: "google_analytics",
  data: {
    report_type: "event_total",
    date,
    event_name,
    event_count,
    key_events,
  },
});

/** SwapTix's funnel, as its dashboard settings list it. */
const SWAPTIX = [
  { event: "ticket_valuation_page", label: "הגעה לעמוד הערכת כרטיס" },
  { event: "ticket_upload", label: "העלאת כרטיס" },
  { event: "sign_up", label: "הרשמה לאתר" },
  { event: "credits_purchase", label: "קניית קרדיטים" },
];

describe("parseTrackedEvents", () => {
  it("keeps the order, trims, falls back to the event name and drops repeats", () => {
    expect(
      parseTrackedEvents({
        tracked_events: [
          { event: " sign_up ", label: "הרשמה" },
          { event: "ticket_sold" },
          { event: "sign_up", label: "שוב" },
          { label: "בלי אירוע" },
          "junk",
        ],
      }),
    ).toStrictEqual([
      { event: "sign_up", label: "הרשמה" },
      { event: "ticket_sold", label: "ticket_sold" },
    ]);
  });

  it("is empty for a dashboard that follows no events", () => {
    expect(parseTrackedEvents({ default_report_mode: "leads" })).toEqual([]);
    expect(parseTrackedEvents(null)).toEqual([]);
    expect(parseTrackedEvents({ tracked_events: "sign_up" })).toEqual([]);
  });
});

describe("summarizeTrackedEvents", () => {
  const records = [
    ga("2026-11-01", "ticket_valuation_page", 100, 80),
    ga("2026-11-02", "ticket_valuation_page", 60),
    ga("2026-11-01", "ticket_upload", 20, 4),
    ga("2026-11-02", "ticket_upload", 20),
    ga("2026-11-02", "sign_up", 10),
    ga("2026-11-02", "page_view", 5000),
    { _source: "facebook_insights", data: { spend: 400 } },
    {
      _source: "google_analytics",
      data: {
        report_type: "event_aggregate",
        event_name: "sign_up",
        event_count: 999,
      },
    },
  ];

  it("counts each event, its cost from ads spend and its step rate", () => {
    const { events } = summarizeTrackedEvents(records, SWAPTIX, 400);
    expect(
      events.map(({ event, count, cost, stepRate }) => [
        event,
        count,
        cost,
        stepRate,
      ]),
    ).toStrictEqual([
      ["ticket_valuation_page", 160, 2.5, null],
      ["ticket_upload", 40, 10, 0.25],
      ["sign_up", 10, 40, 0.25],
      ["credits_purchase", 0, null, 0],
    ]);
  });

  it("gives no cost without ads spend", () => {
    const { events } = summarizeTrackedEvents(records, SWAPTIX, 0);
    expect(events.every((item) => item.cost === null)).toBe(true);
  });

  it("lays out one row per day with every followed event", () => {
    const { days } = summarizeTrackedEvents(records, SWAPTIX, 400);
    expect(days).toStrictEqual([
      {
        date: "2026-11-01",
        ticket_valuation_page: 100,
        ticket_upload: 20,
        sign_up: 0,
        credits_purchase: 0,
      },
      {
        date: "2026-11-02",
        ticket_valuation_page: 60,
        ticket_upload: 20,
        sign_up: 10,
        credits_purchase: 0,
      },
    ]);
  });
});

describe("availableEventNames", () => {
  it("lists the period's GA events, most frequent first", () => {
    expect(
      availableEventNames([
        ga("2026-11-01", "sign_up", 3),
        ga("2026-11-02", "sign_up", 4),
        ga("2026-11-01", "page_view", 50),
        ga("2026-11-01", "ticket_sold", 7),
      ]),
    ).toStrictEqual([
      { event: "page_view", count: 50 },
      { event: "sign_up", count: 7 },
      { event: "ticket_sold", count: 7 },
    ]);
  });
});
