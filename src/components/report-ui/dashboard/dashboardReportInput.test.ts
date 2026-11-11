import { describe, expect, it } from "vitest";
import {
  dashboardRecordTables,
  dashboardReportInput,
} from "./dashboardReportInput";

const FB_INSIGHTS = { id: "fi", integration_type: "facebook_insights" };
const FB_ECOMMERCE = { id: "fe", integration_type: "facebook_ecommerce" };
const GOOGLE_ADS = { id: "ga", integration_type: "google_ads" };
const ANALYTICS = { id: "an", integration_type: "google_analytics" };
const AHREFS = { id: "ah", integration_type: "ahrefs" };

describe("dashboardRecordTables", () => {
  it("keeps the ads and Analytics tables and drops SEO tables", () => {
    expect(
      dashboardRecordTables([FB_INSIGHTS, GOOGLE_ADS, ANALYTICS, AHREFS]),
    ).toEqual([FB_INSIGHTS, GOOGLE_ADS, ANALYTICS]);
  });

  it("skips facebook_insights when facebook_ecommerce is there too", () => {
    expect(dashboardRecordTables([FB_INSIGHTS, FB_ECOMMERCE])).toEqual([
      FB_ECOMMERCE,
    ]);
  });
});

describe("dashboardReportInput", () => {
  it("reads each record's table from _tableId and drops records without one", () => {
    const input = dashboardReportInput({
      records: [
        { _tableId: "ga", data: { spend: 5 } },
        { data: { spend: 9 } },
        { _tableId: "an" },
      ],
      tables: [GOOGLE_ADS, ANALYTICS],
      woo: { revenue: 100, orders: 2 },
    });
    expect(input).toEqual({
      records: [
        { table_id: "ga", data: { spend: 5 } },
        { table_id: "an", data: null },
      ],
      tables: [GOOGLE_ADS, ANALYTICS],
      woo: { revenue: 100, orders: 2 },
    });
  });
});
