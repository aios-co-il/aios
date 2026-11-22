import type { CurrencyCode } from "./currency";
import type { DashboardCurrencies } from "./dashboardCurrencies";

/** A dashboard whose platforms all use one currency. */
export function singleCurrency(
  code: CurrencyCode = "ILS",
): DashboardCurrencies {
  return {
    primary: code,
    byChannel: { facebook: code, google_ads: code },
    mixed: false,
  };
}

/** Meta in shekels and Google Ads in dollars, as on a mixed dashboard. */
export function mixedCurrencies(): DashboardCurrencies {
  return {
    primary: "USD",
    byChannel: { facebook: "ILS", google_ads: "USD" },
    mixed: true,
  };
}
