import { describe, expect, it } from "vitest";
import { parseCrmTableList } from "./crmTableSummary";

const base = { name: "Report", slug: "report" };

describe("parseCrmTableList", () => {
  it("keeps well-formed table rows as-is", () => {
    const row = {
      id: "t1",
      name: "Meta",
      slug: "meta",
      client_id: null,
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_1", extra: 3 },
      campaign_active: false,
    };
    expect(parseCrmTableList([row])).toEqual([row]);
  });

  it("returns an empty list for non-array payloads", () => {
    expect(parseCrmTableList(null)).toEqual([]);
    expect(parseCrmTableList({ error: "x" })).toEqual([]);
  });

  it("drops rows missing required fields or with mistyped known fields", () => {
    expect(
      parseCrmTableList([
        null,
        { ...base },
        { id: "t1", slug: "x" },
        { ...base, id: "t2", campaign_active: "yes" },
        { ...base, id: "t3", integration_settings: { customer_id: 5 } },
        { ...base, id: "t4" },
      ]),
    ).toEqual([{ ...base, id: "t4" }]);
  });
});
