import { describe, expect, it } from "vitest";
import {
  amountsByCurrency,
  formatAmounts,
  formatMixedSpend,
  resolveDashboardCurrencies,
} from "./dashboardCurrencies";
import {
  mixedCurrencies,
  singleCurrency,
} from "./dashboardCurrencies.test-fixture";

/** A report table of this integration and saved currency. */
function table(integration_type: string, currency?: string) {
  return {
    integration_type,
    integration_settings: currency ? { currency } : {},
  };
}

describe("resolveDashboardCurrencies", () => {
  it("keeps Meta in shekels when Google Ads is in dollars", () => {
    const currencies = resolveDashboardCurrencies([
      table("facebook_insights", "ILS"),
      table("google_ads", "USD"),
      table("google_analytics"),
    ]);

    expect(currencies.byChannel).toStrictEqual({
      facebook: "ILS",
      google_ads: "USD",
    });
    expect(currencies.mixed).toBe(true);
  });

  it("reads a Facebook table without a saved currency as shekels", () => {
    const currencies = resolveDashboardCurrencies([
      table("facebook_ecommerce"),
      table("google_ads", "USD"),
    ]);

    expect(currencies.byChannel.facebook).toBe("ILS");
    expect(currencies.mixed).toBe(true);
  });

  it("leaves a single-currency dashboard on its one currency", () => {
    const currencies = resolveDashboardCurrencies([
      table("facebook_insights", "USD"),
      table("google_ads", "USD"),
    ]);

    expect(currencies).toStrictEqual({
      primary: "USD",
      byChannel: { facebook: "USD", google_ads: "USD" },
      mixed: false,
    });
  });

  it("gives a platform without a table the primary currency", () => {
    const currencies = resolveDashboardCurrencies([table("google_ads", "USD")]);

    expect(currencies.byChannel.facebook).toBe("USD");
    expect(currencies.mixed).toBe(false);
  });
});

describe("amountsByCurrency", () => {
  it("adds each currency apart and never across currencies", () => {
    const amounts = amountsByCurrency(
      [
        { channel: "google_ads", amount: 300 },
        { channel: "facebook", amount: 22142 },
      ],
      mixedCurrencies(),
    );

    expect(amounts).toStrictEqual([
      { currency: "ILS", value: 22142 },
      { currency: "USD", value: 300 },
    ]);
  });

  it("divides by each currency's own count for a unit cost", () => {
    const amounts = amountsByCurrency(
      [
        { channel: "facebook", amount: 1000, count: 10 },
        { channel: "google_ads", amount: 50, count: 0 },
      ],
      mixedCurrencies(),
    );

    expect(amounts).toStrictEqual([{ currency: "ILS", value: 100 }]);
  });
});

describe("formatMixedSpend", () => {
  it("writes each currency's spend side by side", () => {
    const text = formatMixedSpend(
      [
        { source: "facebook_insights", spend: 22142 },
        { source: "google_ads", spend: 300 },
        { source: "google_analytics", spend: 0 },
      ],
      mixedCurrencies(),
    );

    expect(text).toBe(
      formatAmounts(
        [
          { currency: "ILS", value: 22142 },
          { currency: "USD", value: 300 },
        ],
        { empty: "" },
      ),
    );
    expect(text).toMatch(/₪.*·.*\$/);
  });

  it("leaves a single-currency dashboard's total to the page", () => {
    expect(
      formatMixedSpend([{ source: "google_ads", spend: 5 }], singleCurrency()),
    ).toBeNull();
  });
});
