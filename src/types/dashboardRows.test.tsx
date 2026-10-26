import { describe, expect, it } from "vitest";
import {
  toCrmRecordRows,
  toDashboardFields,
  toDashboardTables,
} from "./dashboardRows";

describe("toCrmRecordRows", () => {
  it("narrows crm-records rows and drops non-objects", () => {
    expect(
      toCrmRecordRows([
        { id: "r1", data: { date: "2026-10-01" } },
        { id: "r2", data: "broken" },
        null,
        7,
      ]),
    ).toEqual([
      { id: "r1", data: { date: "2026-10-01" } },
      { id: "r2", data: null },
    ]);
    expect(toCrmRecordRows({ error: "nope" })).toEqual([]);
  });
});

describe("toDashboardTables", () => {
  it("keeps every column and narrows the ones the dashboard reads", () => {
    const [table] = toDashboardTables([
      {
        id: "t1",
        name: "FB",
        integration_type: "facebook_insights",
        integration_settings: { campaign_type: "leads" },
        last_sync_at: null,
        slug: "fb",
      },
      { name: "no id" },
    ]);
    expect(table).toEqual({
      id: "t1",
      name: "FB",
      integration_type: "facebook_insights",
      integration_settings: { campaign_type: "leads" },
      last_sync_at: null,
      slug: "fb",
    });
    expect(toDashboardTables(null)).toEqual([]);
  });

  it("reads malformed settings and types as absent", () => {
    expect(
      toDashboardTables([
        { id: "t2", integration_type: 3, integration_settings: "x" },
      ]),
    ).toEqual([
      {
        id: "t2",
        name: "",
        integration_type: null,
        integration_settings: null,
        last_sync_at: null,
      },
    ]);
  });
});

describe("toDashboardFields", () => {
  it("returns keyed fields from a crm-fields response", () => {
    expect(
      toDashboardFields({
        fields: [
          { key: "spend", name: "Spend", position: 2 },
          { name: "no key" },
        ],
      }),
    ).toEqual([{ key: "spend", name: "Spend", position: 2 }]);
    expect(toDashboardFields(null)).toEqual([]);
  });
});
