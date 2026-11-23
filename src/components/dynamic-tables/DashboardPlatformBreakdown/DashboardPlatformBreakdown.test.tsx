import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  cellsOf,
  fbCampaign,
  googleCampaign,
  headers,
  renderBreakdown,
} from "./DashboardPlatformBreakdown.test-fixture";

describe("DashboardPlatformBreakdown", () => {
  it("a dashboard of lead campaigns has no sales, revenue or ROAS columns", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [],
          leads: [fbCampaign("FB leads", { spend: 300, leads: 10 })],
          traffic: [],
        },
        google: [
          googleCampaign("Search", "leads", {
            spend: 100,
            conversions: 10,
            conversions_value: 50,
          }),
        ],
      },
      null,
    );
    expect(headers()).toStrictEqual([
      "פלטפורמה",
      "הוצאה",
      "חשיפות",
      "קליקים",
      "עלות לקליק",
      "לידים",
      "עלות לליד",
    ]);
    expect(screen.queryByText("ROAS")).toBeNull();
    expect(cellsOf("Google Ads - קמפייני לידים")).toStrictEqual([
      "₪100",
      "500",
      "25",
      "₪4.00",
      "10",
      "₪10",
    ]);
    expect(cellsOf('סה"כ')).toStrictEqual([
      "₪400",
      "1500",
      "75",
      "₪5.33",
      "20",
      "₪20",
    ]);
  });

  it("a mixed dashboard fills each row's own goal and totals each goal from sums", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [
            fbCampaign("FB sales", {
              spend: 100,
              purchases: 4,
              purchase_value: 500,
              add_to_cart: 9,
              leads: 3,
            }),
          ],
          leads: [fbCampaign("FB leads", { spend: 200, leads: 4 })],
          traffic: [fbCampaign("FB traffic", { spend: 50 })],
        },
        google: [
          googleCampaign("Shopping", "ecommerce", {
            spend: 300,
            conversions: 6,
            conversions_value: 900,
          }),
          googleCampaign("Search", "leads", { spend: 400, conversions: 1 }),
        ],
      },
      { purchases: 12, revenue: 2250, addToCart: 30, source: "WooCommerce" },
    );
    expect(headers()).toStrictEqual([
      "פלטפורמה",
      "הוצאה",
      "חשיפות",
      "קליקים",
      "עלות לקליק",
      "הוספה לעגלה",
      "רכישות",
      "עלות לרכישה",
      "הכנסות",
      "ROAS",
      "לידים",
      "עלות לליד",
    ]);
    expect(cellsOf("Facebook - קמפייני מכירות").slice(4)).toStrictEqual([
      "9",
      "4",
      "₪25",
      "₪500",
      "5.00",
      "-",
      "-",
    ]);
    // Google Ads reports no add-to-cart, so its sales row shows a dash there.
    expect(cellsOf("Google Ads - קמפייני מכירות")[4]).toBe("-");
    expect(cellsOf("Facebook - קמפייני לידים").slice(4)).toStrictEqual([
      "-",
      "-",
      "-",
      "-",
      "-",
      "4",
      "₪50",
    ]);
    expect(cellsOf("Facebook - קמפייני תנועה").slice(4)).toStrictEqual(
      Array(7).fill("-"),
    );
    // Each goal under its own heading with its own subtotal: WooCommerce
    // revenue over the ₪450 spent outside lead campaigns, and the lead
    // campaigns' ₪600 over their 5 leads. The last row adds up only what
    // every goal shares.
    expect(screen.getByText("קמפייני מכירות")).toBeTruthy();
    expect(cellsOf(/^סה״כ מכירות/).slice(4)).toStrictEqual([
      "30",
      "12",
      "₪38",
      "₪2250",
      "5.00",
      "-",
      "-",
    ]);
    expect(cellsOf("סה״כ לידים").slice(4)).toStrictEqual([
      "-",
      "-",
      "-",
      "-",
      "-",
      "5",
      "₪120",
    ]);
    expect(cellsOf('סה"כ כל הקמפיינים')).toStrictEqual([
      "₪1050",
      "4000",
      "200",
      "₪5.25",
      ...Array(7).fill("-"),
    ]);
    expect(
      screen.getByText("הכנסות WooCommerce / הוצאות פרסום ללא קמפייני לידים"),
    ).toBeTruthy();
  });

  it("a dash for ROAS and add-to-cart when nothing can be set against them", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [fbCampaign("FB sales", { purchases: 1 })],
          leads: [fbCampaign("FB leads", { spend: 200, leads: 4 })],
          traffic: [],
        },
        google: [],
      },
      { purchases: 2, revenue: 500, addToCart: 0, source: "WooCommerce" },
    );
    // All ₪200 went to lead campaigns, so the store's ₪500 has no spend.
    expect(cellsOf(/^סה״כ מכירות/).slice(4)).toStrictEqual([
      "-",
      "2",
      "-",
      "₪500",
      "-",
      "-",
      "-",
    ]);
    expect(cellsOf("סה״כ לידים").slice(-2)).toStrictEqual(["4", "₪50"]);
  });

  it("a sales row whose purchases carry no value shows its cost per purchase, not a ROAS of 0", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [
            fbCampaign("FB gift course", { spend: 336, purchases: 15 }),
          ],
          leads: [],
          traffic: [],
        },
        google: [],
      },
      null,
    );
    // Measured like leads: by cost per purchase, with no revenue or ROAS
    // column at all.
    expect(headers()).not.toContain("הכנסות");
    expect(headers()).not.toContain("ROAS");
    expect(cellsOf("Facebook - קמפייני מכירות").slice(4)).toStrictEqual([
      "-",
      "15",
      "₪22",
    ]);
    expect(screen.getByText(/נמדד בעלות לרכישה ולא ב-ROAS/)).toBeTruthy();
  });
});
