import { describe, expect, it } from "vitest";
import {
  asJsonObject,
  parseJsonFloat,
  thrownCode,
  thrownMessage,
  toCrmRecordRows,
  toDashboardFields,
  toDashboardTables,
} from "./dashboard-b18";

describe("asJsonObject", () => {
  it("keeps objects and reads everything else as empty", () => {
    const data = { spend: 5 };
    expect(asJsonObject(data)).toBe(data);
    expect(asJsonObject(null)).toEqual({});
    expect(asJsonObject([1, 2])).toEqual({});
    expect(asJsonObject("x")).toEqual({});
  });
});

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

describe("thrown values", () => {
  it("reads message and code like optional chaining did", () => {
    const pgError = { message: "duplicate", code: "23505" };
    expect(thrownMessage(pgError)).toBe("duplicate");
    expect(thrownCode(pgError)).toBe("23505");
    expect(thrownMessage(new Error("boom"))).toBe("boom");
    expect(thrownMessage("text")).toBeUndefined();
    expect(thrownCode(null)).toBeUndefined();
  });
});

describe("parseJsonFloat", () => {
  it("matches parseFloat's string coercion", () => {
    expect(parseJsonFloat("12.5")).toBe(12.5);
    expect(parseJsonFloat(3)).toBe(3);
    expect(parseJsonFloat(undefined)).toBeNaN();
    expect(parseJsonFloat(null)).toBeNaN();
  });
});
