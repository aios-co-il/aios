const CURRENCY_CODES = new Set(["ILS", "USD", "EUR"]);

/** Whole amounts in the table's currency (shekels unless it says USD or EUR). */
export function makeFormatCurrency(
  currencyCode: unknown,
): (amount: number) => string {
  const requested =
    typeof currencyCode === "string" ? currencyCode.toUpperCase() : "ILS";
  const currency = CURRENCY_CODES.has(requested) ? requested : "ILS";
  const formatter = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return (amount) => formatter.format(amount);
}

/** A count shortened to K or M, with two decimals only when it has a fraction. */
export function formatShortNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toFixed(num % 1 === 0 ? 0 : 2);
}

/** A generic table's cell: numbers in Hebrew notation, a dash when empty. */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(
      value,
    );
  }
  return String(value);
}
