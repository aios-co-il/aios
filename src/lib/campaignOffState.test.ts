import { describe, expect, it } from "vitest";
import {
  applyCampaignOffRule,
  campaignOffKeys,
  isCampaignOff,
  reportOffLookup,
  showCampaignRow,
  switchedOffTableIds,
} from "./campaignOffState";

const byCampaign = (data: Record<string, unknown>) => String(data.campaign_id);

describe("showCampaignRow", () => {
  it("shows a campaign that is on, with or without spend", () => {
    expect(showCampaignRow({ off: false, spend: 0 })).toBe(true);
    expect(showCampaignRow({ off: false, spend: 120 })).toBe(true);
  });

  it("shows an off campaign only when it spent in the period", () => {
    expect(showCampaignRow({ off: true, spend: 35 })).toBe(true);
    expect(showCampaignRow({ off: true, spend: 0 })).toBe(false);
  });
});

describe("isCampaignOff", () => {
  it("is off when paused, removed or its report is switched off", () => {
    expect(isCampaignOff({ deliveryStatus: "paused" })).toBe(true);
    expect(isCampaignOff({ deliveryStatus: "removed" })).toBe(true);
    expect(
      isCampaignOff({ deliveryStatus: "active", reportActive: false }),
    ).toBe(true);
  });

  it("is not off when active or the status is unknown", () => {
    expect(isCampaignOff({ deliveryStatus: "active" })).toBe(false);
    expect(isCampaignOff({ deliveryStatus: "unknown" })).toBe(false);
    expect(isCampaignOff({ deliveryStatus: null, reportActive: true })).toBe(
      false,
    );
  });
});

describe("campaignOffKeys", () => {
  it("takes the status of the campaign's latest dated record", () => {
    const records = [
      {
        data: {
          campaign_id: "a",
          date: "2026-10-01",
          effective_status: "ACTIVE",
        },
      },
      {
        data: {
          campaign_id: "a",
          date: "2026-10-03",
          effective_status: "PAUSED",
        },
      },
      {
        data: {
          campaign_id: "b",
          date: "2026-10-03",
          effective_status: "ACTIVE",
        },
      },
      {
        data: {
          campaign_id: "b",
          date: "2026-10-01",
          effective_status: "PAUSED",
        },
      },
    ];
    expect([...campaignOffKeys(records, byCampaign)]).toEqual(["a"]);
  });

  it("leaves a campaign with no stored status on", () => {
    const records = [
      { data: { campaign_id: "g1", date: "2026-10-03", cost: 50 } },
    ];
    expect(campaignOffKeys(records, byCampaign).size).toBe(0);
  });

  it("marks every campaign of a switched-off report", () => {
    const isReportOff = reportOffLookup([
      { id: "t-off", campaign_active: false },
      { id: "t-on", campaign_active: true },
    ]);
    const records = [
      { table_id: "t-off", data: { campaign_id: "g1" } },
      { _tableId: "t-on", data: { campaign_id: "g2" } },
    ];
    expect([...campaignOffKeys(records, byCampaign, isReportOff)]).toEqual([
      "g1",
    ]);
  });
});

describe("reportOffLookup", () => {
  it("lets a single report table stand for records without a table id", () => {
    const isReportOff = reportOffLookup([{ id: "t1", campaign_active: false }]);
    expect(isReportOff({ data: {} })).toBe(true);
  });

  it("treats a report without the switch as on", () => {
    expect(reportOffLookup([{ id: "t1" }])({ data: {} })).toBe(false);
    expect(reportOffLookup(undefined)({ table_id: "t1" })).toBe(false);
  });

  it("lists the switched-off tables", () => {
    expect([
      ...switchedOffTableIds([
        { id: "a", campaign_active: false },
        { id: "b", campaign_active: null },
      ]),
    ]).toEqual(["a"]);
  });
});

describe("applyCampaignOffRule", () => {
  it("marks off rows and drops the off rows that spent nothing", () => {
    const rows = [
      { key: "on-idle", spend: 0 },
      { key: "off-spent", spend: 80 },
      { key: "off-idle", spend: 0 },
    ];
    const result = applyCampaignOffRule(rows, {
      keyOf: (row) => row.key,
      spendOf: (row) => row.spend,
      offKeys: new Set(["off-spent", "off-idle"]),
    });
    expect(result).toEqual([
      { key: "on-idle", spend: 0, off: false },
      { key: "off-spent", spend: 80, off: true },
    ]);
  });
});
