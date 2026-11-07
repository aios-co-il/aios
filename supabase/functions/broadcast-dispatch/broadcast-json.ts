import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";

const audienceSourceSchema = z.object({ source: z.unknown() });

const storedStatsSchema = z.record(z.custom<Json>()).catch({});

/** An automation broadcast without an audience source keeps receiving contacts. */
export function isAutomationStream(broadcast: {
  origin: string | null;
  audience_filter: Json | null;
}): boolean {
  if (broadcast.origin !== "automation") {
    return false;
  }

  const filter = audienceSourceSchema.safeParse(broadcast.audience_filter);
  return !(filter.success && filter.data.source);
}

/** The stored `broadcasts.stats` object; anything else reads as empty. */
export function storedStats(
  value: Json | null | undefined,
): Record<string, Json> {
  return storedStatsSchema.parse(value);
}
