import { z } from "npm:zod@3.25.76";
const metricSchema = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .nullish();
/** Ahrefs metrics are finite numbers or an explicitly unavailable null. */
export type KeywordMetrics = {
  volume: number | null;
  kd: number | null;
  cpc: number | null;
};
/** Normalize numeric API strings while refusing objects and non-finite values. */
export function numericMetric(value: unknown): number | null {
  const parsed = metricSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data ?? null;
  }
  console.warn("[ahrefs] rejected non-numeric metric", { kind: typeof value });
  return null;
}
