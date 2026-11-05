import { assertStrictEquals } from "jsr:@std/assert@1";

import { computeGoalMetricsFromRecords } from "../_shared/campaign-pulse.ts";
import { pulseTrendWindows } from "../_shared/pulse-campaign-goals.mjs";
import { pulseClientWindows, recordsThrough } from "./client-windows.ts";

Deno.test(
  "windows: 00:30 in Israel is already the next day (UTC is still the day before)",
  () => {
    // Winter (UTC+2): 2026-10-25T22:30Z is 2026-10-26 00:30 in Jerusalem.
    const w = pulseClientWindows(new Date("2026-10-25T22:30:00.000Z"));
    assertStrictEquals(w.today, "2026-10-26");
    assertStrictEquals(w.end, "2026-10-25");
    assertStrictEquals(w.current7Start, "2026-10-19");
    assertStrictEquals(w.current3Start, "2026-10-23");
    assertStrictEquals(w.previous7Start, "2026-10-12");
    assertStrictEquals(w.queryStart, "2026-09-21");
  },
);

Deno.test(
  "windows: 23:59 in Israel is still the same day (summer, UTC+3)",
  () => {
    const w = pulseClientWindows(new Date("2026-07-14T20:59:00.000Z"));
    assertStrictEquals(w.today, "2026-07-14");
    assertStrictEquals(w.end, "2026-07-13");
    const next = pulseClientWindows(new Date("2026-07-14T21:01:00.000Z"));
    assertStrictEquals(next.today, "2026-07-15");
    assertStrictEquals(next.end, "2026-07-14");
  },
);

Deno.test(
  "windows match campaign_breakdown (pulseTrendWindows) for the same day",
  () => {
    const now = new Date("2026-10-26T05:00:00.000Z");
    const client = pulseClientWindows(now);
    const breakdown = pulseTrendWindows(client.today);
    assertStrictEquals(client.current7Start, breakdown.current7.start);
    assertStrictEquals(client.end, breakdown.current7.end);
    assertStrictEquals(client.current3Start, breakdown.current3.start);
    assertStrictEquals(client.queryStart, breakdown.queryStart);
  },
);

Deno.test(
  "the 7-day client metrics exclude today's partial day and cover 7 full days",
  () => {
    const w = pulseClientWindows(new Date("2026-10-26T05:00:00.000Z"));
    const day = (date: string, spend: number, leads: number) => ({
      data: { date, entity_level: "campaign", spend, leads },
    });
    const rows = [
      day("2026-10-12", 70, 7), // first day of the prior week
      day("2026-10-18", 70, 7), // last day of the prior week
      day("2026-10-19", 100, 5), // first current day
      day("2026-10-25", 100, 5), // yesterday
      day("2026-10-26", 900, 0), // today, partial: must not count
    ];
    const metrics = computeGoalMetricsFromRecords(
      recordsThrough(rows, w.end),
      "leads",
      w.current7Start,
      w.previous7Start,
    );
    assertStrictEquals(metrics.spend, 200);
    assertStrictEquals(metrics.outcomes, 10);
    assertStrictEquals(metrics.efficiency, 20);
    assertStrictEquals(metrics.changePct, 100); // CPL 10 -> 20
  },
);
