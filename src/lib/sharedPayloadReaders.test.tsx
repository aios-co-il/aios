import { describe, expect, it } from "vitest";
import { readIntegrationSettings } from "./integrationSettingsReader";
import { toSharedDashboardPayload } from "./sharedDashboardPayload";
import { toSharedTablePayload } from "./sharedTablePayload";

const report = {
  id: "r1",
  domain: "example.com",
  received_at: "2026-10-01T00:00:00Z",
  report_date: "2026-10-01",
  report_data: { snapshot: {} },
};

describe("readIntegrationSettings", () => {
  it("keeps unknown keys and narrows known ones", () => {
    const settings = readIntegrationSettings({
      currency: "ILS",
      ahrefs_project_id: 42,
      manual_roi: { closures: 3, revenue: "x" },
      shared_tabs: { gsc: false },
      campaign_type: 7,
    });
    expect(settings).toMatchObject({
      currency: "ILS",
      ahrefs_project_id: 42,
      manual_roi: { closures: 3, revenue: undefined },
      shared_tabs: { gsc: false },
      campaign_type: undefined,
    });
    expect(readIntegrationSettings("nope")).toBeNull();
  });
});

describe("toSharedTablePayload", () => {
  it("narrows a public-table SEO body and keeps id-less GSC rows", () => {
    const payload = toSharedTablePayload({
      table: { id: "t1", name: "SEO", integration_type: "ahrefs" },
      records: [],
      fields: [{ key: "k", name: "K" }],
      ahrefs_reports: [report, { id: "bad" }],
      gsc_records: [{ data: { query: "shoes", clicks: 3 } }],
      gsc_multi_period: {
        prevMonth: [
          { keyword: "a", clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
        ],
      },
      maskyoo_snapshots: [
        { category: "organic", incoming_count: 4, is_manual: false },
      ],
      maskyoo_period: { start: "2026-09-01", end: "2026-09-30" },
      seo_monthly: {
        months: [{ month: "2026-09-01", status: "up", work: {} }],
      },
      seo_keyword_relevance: { force_relevant: ["a", 1] },
    });
    expect(payload.table).toMatchObject({ id: "t1", client_id: undefined });
    expect(payload.fields).toEqual([
      { field_key: undefined, field_label: undefined },
    ]);
    expect(payload.ahrefs_reports?.map((r) => r.id)).toEqual(["r1"]);
    expect(payload.gsc_records).toEqual([
      { id: undefined, data: { query: "shoes", clicks: 3 } },
    ]);
    expect(payload.gsc_multi_period?.prevMonth).toHaveLength(1);
    expect(payload.gsc_multi_period?.yearly).toEqual([]);
    expect(payload.maskyoo_snapshots?.[0].incoming_count).toBe(4);
    expect(payload.maskyoo_period).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(payload.seo_monthly?.months?.[0].status).toBe("up");
    expect(payload.seo_keyword_relevance?.force_relevant).toEqual(["a"]);
    expect(payload.ga_records).toBeUndefined();
  });

  it("reads non-object bodies as empty", () => {
    expect(toSharedTablePayload(null).table).toBeUndefined();
    expect(toSharedTablePayload({ error: "gone" }).error).toBe("gone");
  });
});

describe("toSharedDashboardPayload", () => {
  it("narrows dashboard records, tables and Woo orders", () => {
    const payload = toSharedDashboardPayload({
      dashboard: { name: "Acme", client_id: null, settings: { mode: "x" } },
      tables: [
        { id: "t1", integration_type: "facebook_insights" },
        { name: "no id" },
      ],
      records: [
        {
          id: "r1",
          data: { spend: 5 },
          _source: "facebook_insights",
          _integrationSettings: { campaign_type: "leads" },
        },
        { data: { spend: 1 } },
      ],
      woocommerce: { sites: [{ id: 1 }], orders: [{ total: "10" }, 3] },
    });
    expect(payload.dashboard).toMatchObject({ name: "Acme", client_id: null });
    expect(payload.tables?.map((t) => t.id)).toEqual(["t1"]);
    expect(payload.records).toEqual([
      {
        id: "r1",
        data: { spend: 5 },
        _source: "facebook_insights",
        _integrationSettings: expect.objectContaining({
          campaign_type: "leads",
        }),
      },
    ]);
    expect(payload.woocommerce?.sites).toEqual([{ id: 1 }]);
    expect(payload.woocommerce?.orders?.map((o) => o.total)).toEqual(["10"]);
  });
});
