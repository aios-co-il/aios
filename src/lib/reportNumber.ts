import { cn } from "@/lib/utils";

/** A report table number in Hebrew locale, rounded to `digits` fraction digits. */
export function formatReportNumber(value: number, digits = 0): string {
  return value.toLocaleString("he-IL", { maximumFractionDigits: digits });
}

/** a ÷ b, or 0 when there is nothing to divide by. */
export function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/**
 * Class of a coloured result cell. The total row is bold throughout, so only
 * entity rows add font-medium.
 */
export function resultCellClass(color: string, isTotal: boolean): string {
  return cn("p-2 text-center", color, !isTotal && "font-medium");
}
