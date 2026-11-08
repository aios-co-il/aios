import { describe, expect, it } from "vitest";
import {
  toWooOrderAttribution,
  toWooOrderRow,
  toWooOrderRows,
} from "./wooOrderRows";

describe("toWooOrderAttribution", () => {
  it("keeps string fields and nulls the rest", () => {
    expect(
      toWooOrderAttribution({
        source_type: "utm",
        utm_source: "google",
        utm_medium: 5,
        label: "Google / cpc",
      }),
    ).toEqual({
      source_type: "utm",
      utm_source: "google",
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: null,
      session_entry: null,
      device_type: null,
      label: "Google / cpc",
    });
    expect(toWooOrderAttribution(null)).toBeNull();
    expect(toWooOrderAttribution("utm")).toBeNull();
  });
});

describe("toWooOrderRow", () => {
  it("narrows a selected order row", () => {
    const order = toWooOrderRow({
      id: "o1",
      total: "120.50",
      status: "completed",
      date_paid: "2026-10-01T10:00:00Z",
      line_items: [{ name: "Shoe", quantity: 1 }],
    });
    expect(order).toMatchObject({
      id: "o1",
      total: "120.50",
      status: "completed",
      date_paid: "2026-10-01T10:00:00Z",
      date_created: null,
      attribution: null,
      line_items: [{ name: "Shoe", quantity: 1 }],
    });
  });

  it("drops non-object rows", () => {
    expect(toWooOrderRow(null)).toBeNull();
    expect(toWooOrderRows([{ id: "a", total: 1 }, "x", null])).toHaveLength(1);
    expect(toWooOrderRows(null)).toEqual([]);
  });
});
