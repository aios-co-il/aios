import { describe, expect, it } from "vitest";
import { computeGaOrganicByMonth } from "./computeGaOrganicByMonth";
import { toGscSites } from "./gscSites";
import {
  compareByPosition,
  dedupeKeywordRows,
  positionDelta,
} from "./keywordRows";
import { getVal } from "./snapshotValues";

describe("keyword rows with numeric strings", () => {
  it("computes position deltas like JS subtraction did", () => {
    expect(positionDelta("12", "4")).toBe(8);
    expect(positionDelta(3, "5")).toBe(-2);
    expect(positionDelta(null, 4)).toBeNull();
    expect(positionDelta(7, undefined)).toBeNull();
  });

  it("sorts by numeric position, missing positions last", () => {
    const rows = [{ position: "10" }, { position: 2 }, {}, { position: "3" }];
    expect([...rows].sort(compareByPosition)).toEqual([
      { position: 2 },
      { position: "3" },
      { position: "10" },
      {},
    ]);
  });

  it("keeps the best-ranked variant and fills its blanks", () => {
    expect(
      dedupeKeywordRows([
        { keyword: "Shoes", position: "9", volume: 100, url: "/a" },
        { keyword: "shoes ", position: "2", traffic: "5", url: "" },
        { keyword: "", position: 1 },
      ]),
    ).toEqual([
      {
        keyword: "shoes ",
        position: "2",
        traffic: "5",
        volume: 100,
        url: "/a",
      },
    ]);
  });
});

describe("getVal", () => {
  it("returns the first non-null number or string", () => {
    const snap = { a: null, b: "120", c: 5 };
    expect(getVal(snap, "a", "b", "c")).toBe("120");
    expect(getVal(snap, "c")).toBe(5);
    expect(getVal(snap, "missing")).toBeUndefined();
    expect(getVal({ obj: { n: 1 } }, "obj", "c")).toBeUndefined();
  });
});

describe("toGscSites", () => {
  it("keeps sites with a siteUrl", () => {
    expect(
      toGscSites([
        { siteUrl: "sc-domain:a.com", permissionLevel: "siteOwner" },
        { siteUrl: "https://b.com/", permissionLevel: 3 },
        { permissionLevel: "siteOwner" },
        "x",
      ]),
    ).toEqual([
      { siteUrl: "sc-domain:a.com", permissionLevel: "siteOwner" },
      { siteUrl: "https://b.com/", permissionLevel: undefined },
    ]);
    expect(toGscSites({ siteUrl: "a" })).toEqual([]);
  });
});

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
    expect(computeGaOrganicByMonth(null)).toEqual([]);
  });
});
