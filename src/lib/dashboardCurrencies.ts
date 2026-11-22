import {
  formatCurrency,
  formatUnitCost,
  normalizeCurrencyCode,
  resolveDashboardCurrency,
  type CurrencyCode,
} from "./currency";

/** An ads platform of a dashboard; both Facebook table kinds are Meta. */
export type AdsChannel = "facebook" | "google_ads";

/**
 * The currencies a dashboard shows its amounts in. Each ads platform keeps
 * the currency its account is managed in (the report table's saved currency,
 * as the platform's own report shows it); amounts are never converted.
 */
export type DashboardCurrencies = {
  /** Amounts outside the ads platforms (store, Analytics) and single-currency dashboards. */
  primary: CurrencyCode;
  byChannel: Record<AdsChannel, CurrencyCode>;
  /** Whether the dashboard's ads platforms use more than one currency. */
  mixed: boolean;
};

/** An amount in one currency. */
export type CurrencyAmount = { currency: CurrencyCode; value: number };

/** A platform's part of a total: what it spent and what the spend bought. */
export type ChannelPart = {
  channel: AdsChannel;
  /** The numerator in the platform's currency, such as spend. */
  amount: number;
  /** The denominator of a unit cost, such as clicks or leads; 1 for a plain sum. */
  count?: number;
};

type CurrencyTable = {
  integration_type?: string | null;
  integration_settings?: { currency?: string | null } | null;
};

const CHANNEL_OF_INTEGRATION: Record<string, AdsChannel> = {
  facebook_insights: "facebook",
  facebook_ecommerce: "facebook",
  google_ads: "google_ads",
};

/** The order amounts of several currencies are written in. */
const CURRENCY_ORDER: Array<CurrencyCode> = ["ILS", "USD", "EUR"];

/**
 * Each ads platform's currency from its first report table. A platform
 * without a table takes the primary currency, so a single-platform or
 * single-currency dashboard reads exactly as before.
 */
export function resolveDashboardCurrencies(
  tables: Array<CurrencyTable> = [],
): DashboardCurrencies {
  const primary = resolveDashboardCurrency(tables);
  const found = new Map<AdsChannel, CurrencyCode>();
  for (const table of tables) {
    const channel = adsChannelOf(table.integration_type);
    if (channel && !found.has(channel)) {
      found.set(
        channel,
        normalizeCurrencyCode(table.integration_settings?.currency),
      );
    }
  }
  return {
    primary,
    byChannel: {
      facebook: found.get("facebook") ?? primary,
      google_ads: found.get("google_ads") ?? primary,
    },
    mixed: new Set(found.values()).size > 1,
  };
}

/** The ads platform of an integration type or record source; null for others. */
export function adsChannelOf(
  integrationType: string | null | undefined,
): AdsChannel | null {
  return CHANNEL_OF_INTEGRATION[integrationType ?? ""] ?? null;
}

/** The platform's currency, or the primary one for a non-ads source. */
export function currencyOfSource(
  currencies: DashboardCurrencies,
  integrationType: string | null | undefined,
): CurrencyCode {
  const channel = adsChannelOf(integrationType);
  return channel ? currencies.byChannel[channel] : currencies.primary;
}

/**
 * The parts added up per currency, in a fixed order. With `count`, each
 * currency's total amount over its total count (a unit cost); a currency
 * whose count is 0 is left out.
 */
export function amountsByCurrency(
  parts: Array<ChannelPart>,
  currencies: DashboardCurrencies,
): Array<CurrencyAmount> {
  const totals = new Map<CurrencyCode, { amount: number; count: number }>();
  for (const part of parts) {
    const currency = currencies.byChannel[part.channel];
    const total = totals.get(currency) ?? { amount: 0, count: 0 };
    total.amount += part.amount;
    total.count += part.count ?? 1;
    totals.set(currency, total);
  }
  const unitCost = parts.some((part) => part.count !== undefined);
  return CURRENCY_ORDER.flatMap((currency) => {
    const total = totals.get(currency);
    if (!total || (unitCost && total.count <= 0)) {
      return [];
    }
    return [
      {
        currency,
        value: unitCost ? total.amount / total.count : total.amount,
      },
    ];
  });
}

/**
 * Amounts of several currencies side by side ("₪22,142 · $1,234"), never
 * added together; `empty` when there is none.
 */
export function formatAmounts(
  amounts: Array<CurrencyAmount>,
  options: { unitCost?: boolean; empty: string },
): string {
  if (amounts.length === 0) {
    return options.empty;
  }
  const format = options.unitCost ? formatUnitCost : formatCurrency;
  return amounts
    .map(({ currency, value }) => format(value, currency))
    .join(" · ");
}

/** The dashboard formatters for amounts in one currency. */
export function moneyFormatters(currency: CurrencyCode): {
  formatCurrency: (value: number) => string;
  formatUnitCost: (value: number) => string;
} {
  return {
    formatCurrency: (value) => formatCurrency(value, currency),
    formatUnitCost: (value) => formatUnitCost(value, currency),
  };
}

/**
 * Spend of several sources per currency ("₪22,142 · $1,234"); null when the
 * dashboard's platforms share one currency, so its single total stays as is.
 * Non-ads sources are left out.
 */
export function formatMixedSpend(
  spendBySource: Array<{ source: string; spend: number }>,
  currencies: DashboardCurrencies,
): string | null {
  if (!currencies.mixed) {
    return null;
  }
  const parts = spendBySource.flatMap(({ source, spend }) => {
    const channel = adsChannelOf(source);
    return channel ? [{ channel, amount: spend }] : [];
  });
  return formatAmounts(amountsByCurrency(parts, currencies), {
    empty: formatCurrency(0, currencies.primary),
  });
}

/** The key of a currency's spend in a daily chart row. */
export function spendKeyOf(currency: CurrencyCode): `spend_${CurrencyCode}` {
  return `spend_${currency}`;
}

/** The currencies whose spend a mixed dashboard charts apart, in order. */
export function chartCurrencies(
  currencies: DashboardCurrencies,
): Array<CurrencyCode> {
  const present = new Set(Object.values(currencies.byChannel));
  return CURRENCY_ORDER.filter((currency) => present.has(currency));
}
