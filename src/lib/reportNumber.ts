/** A report table number in Hebrew locale, rounded to `digits` fraction digits. */
export function formatReportNumber(value: number, digits = 0): string {
  return value.toLocaleString("he-IL", { maximumFractionDigits: digits });
}
