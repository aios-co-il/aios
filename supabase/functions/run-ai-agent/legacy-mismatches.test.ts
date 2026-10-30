import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { legacyMismatches } from "./legacy-mismatches.ts";

describe("legacyMismatches", () => {
  it("turns per-day findings into one verify entry per campaign and metric", () => {
    const mismatch = (
      date: string,
      metric: string,
      aios: number,
      meta: number,
    ) => ({
      kind: "mismatch" as const,
      campaign_id: "1",
      date,
      metric,
      aios_value: aios,
      platform_value: meta,
      details: { campaign_name: "A" },
    });
    const out = legacyMismatches([
      {
        kind: "missing_day",
        campaign_id: null,
        date: "2026-10-21",
        metric: "spend",
        aios_value: 0,
        platform_value: 300,
        details: {},
      },
      mismatch("2026-10-20", "spend", 70, 100),
      mismatch("2026-10-22", "spend", 50, 80),
      mismatch("2026-10-22", "leads", 1, 4),
      {
        kind: "missing_on_platform",
        campaign_id: "9",
        date: null,
        metric: "spend",
        aios_value: 55,
        platform_value: 0,
        details: { campaign_name: "Z" },
      },
    ]);
    assertEquals(out, [
      { kind: "missing_day", date: "2026-10-21", meta: 300, aios: 0 },
      {
        kind: "missing_in_meta",
        campaign_id: "9",
        campaign_name: "Z",
        meta: 0,
        aios: 55,
      },
      {
        kind: "spend",
        campaign_id: "1",
        campaign_name: "A",
        meta: 180,
        aios: 120,
        dates: ["2026-10-20", "2026-10-22"],
      },
      {
        kind: "results",
        campaign_id: "1",
        campaign_name: "A",
        metric: "leads",
        meta: 4,
        aios: 1,
        dates: ["2026-10-22"],
      },
    ]);
  });
});
