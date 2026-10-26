import { describe, expect, it } from "vitest";
import { parseCrmTableList } from "./crmTableSummary";

const base = { name: "Report", slug: "report" };

describe("parseCrmTableList", () => {
  it("keeps the known fields of well-formed table rows", () => {
    const row = {
      id: "t1",
      name: "Meta",
      slug: "meta",
      client_id: null,
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_1", data_source: "ahrefs" },
      campaign_active: false,
    };
    expect(parseCrmTableList([{ ...row, category: "ads" }])).toEqual([row]);
  });

  it("returns an empty list for non-array payloads", () => {
    expect(parseCrmTableList(null)).toEqual([]);
    expect(parseCrmTableList({ error: "x" })).toEqual([]);
  });

  it("drops only rows without a string id, name or slug", () => {
    expect(
      parseCrmTableList([
        null,
        "t0",
        { ...base },
        { id: "t1", slug: "x" },
        { ...base, id: 7 },
        { ...base, id: "t4" },
      ]),
    ).toEqual([{ ...base, id: "t4" }]);
  });

  it("keeps rows whose optional fields have unexpected types, without those fields", () => {
    const [table] = parseCrmTableList([
      {
        ...base,
        id: "t2",
        client_id: "c1",
        integration_type: "google_ads",
        campaign_active: "yes",
        integration_settings: {
          customer_id: 5,
          ad_account_id: "act_9",
          target: "x.co",
        },
      },
    ]);
    expect(table).toEqual({
      ...base,
      id: "t2",
      client_id: "c1",
      integration_type: "google_ads",
      integration_settings: { ad_account_id: "act_9", target: "x.co" },
    });
    expect(table.campaign_active).toBeUndefined();
  });

  it("treats non-object integration settings as missing settings", () => {
    const [table] = parseCrmTableList([
      { ...base, id: "t3", integration_settings: "broken" },
    ]);
    expect(table.integration_settings).toBeNull();
  });
});
