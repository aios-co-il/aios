import { cn } from "@/lib/utils";

/** A report table number in Hebrew locale, rounded to `digits`. */
export const formatReportNumber = (value: number, digits = 0) =>
  value.toLocaleString("he-IL", { maximumFractionDigits: digits });

/** a ÷ b, or 0 when there is nothing to divide by. */
export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/**
 * Class of a coloured result cell. The total row is bold throughout, so only
 * entity rows add font-medium.
 */
export const resultCellClass = (color: string, isTotal: boolean) =>
  cn("p-2 text-center", color, !isTotal && "font-medium");
