import type { ComponentProps } from "react";
import type { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";
import { aggregateGscQueryRows } from "@/lib/gscPosition";
import type { SharedSeoPayload } from "./sharedSeoPayload";

type PublicGscKeyword = NonNullable<
  ComponentProps<typeof PublicSeoView>["gscData"]
>[number];

/**
 * The shared SEO report's Search Console keywords: clicks and impressions
 * summed per query, position weighted by impressions. Days with position 0
 * are not a rank.
 */
export function sharedGscKeywords(
  records: NonNullable<SharedSeoPayload["gsc_records"]>,
): Array<PublicGscKeyword> {
  return aggregateGscQueryRows(
    records.map((record) => {
      const data = record.data || record;
      return {
        query: data.query || data.keyword || "",
        clicks: data.clicks,
        impressions: data.impressions,
        position: data.position,
      };
    }),
  ).map((row) => ({
    keyword: row.query,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? Math.round(row.ctr * 10000) / 100 : 0,
    position: row.position,
  }));
}
