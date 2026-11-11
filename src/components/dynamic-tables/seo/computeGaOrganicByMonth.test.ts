import { describe, expect, it } from "vitest";
import { computeGaOrganicByMonth } from "./computeGaOrganicByMonth";
describe("computeGaOrganicByMonth", () => {
  it("prefers monthly_channel rows and skips paid channels", () => {
    expect(
      computeGaOrganicByMonth([
        {
          data: {
            report_type: "monthly_channel",
            month: "2026-09",
            channel_group: "Organic Search",
            sessions: "40",
          },
        },
        {
          data: {
            report_type: "monthly_channel",
            month: "2026-09",
            channel_group: "Paid Search",
            sessions: 99,
          },
        },
        {
          data: {
            report_type: "monthly_channel",
            month: "2026-08",
            channel_group: "Direct",
            sessions: 10,
          },
        },
        {
          data: {
            report_type: "daily_source",
            date: "2026-09-01",
            sessions: 1,
          },
        },
      ]),
    ).toEqual([
      { month: "2026-08", sessions: 10 },
      { month: "2026-09", sessions: 40 },
    ]);
  });

  it("falls back to daily_source then monthly_organic", () => {
    expect(
      computeGaOrganicByMonth([
        {
          data: {
            report_type: "daily_source",
            date: "2026-09-02",
            source_medium: "google / organic",
            sessions: 3,
          },
        },
        {
          data: {
            report_type: "daily_source",
            date: "2026-09-03",
            source_medium: "google / cpc",
            sessions: 50,
          },
        },
      ]),
    ).toEqual([{ month: "2026-09", sessions: 3 }]);
    expect(
      computeGaOrganicByMonth([
        {
          data: {
            report_type: "monthly_organic",
            month: "2026-07",
            sessions: "x",
          },
        },
        { data: null },
      ]),
    ).toEqual([{ month: "2026-07", sessions: 0 }]);
  });
});
