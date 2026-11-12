import type { ComponentProps } from "react";
import type { GoogleAnalyticsDashboard } from "@/components/dynamic-tables/GoogleAnalyticsDashboard";
import type { PublicGscView } from "@/components/dynamic-tables/PublicGscView";
import type { PublicMaskyooCallsCard } from "@/components/dynamic-tables/PublicMaskyooCallsCard";
import type { PublicSeoMonthlyWorkView } from "@/components/dynamic-tables/PublicSeoMonthlyWorkView";
import type { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";

type SeoViewProps = ComponentProps<typeof PublicSeoView>;

/** The parts public-table adds for an SEO (Ahrefs) share, in the shapes the SEO views take. */
export type SharedSeoPayload = {
  ahrefs_reports?: SeoViewProps["reports"];
  ga_records?: ComponentProps<typeof GoogleAnalyticsDashboard>["records"];
  gsc_records?: ComponentProps<typeof PublicGscView>["records"];
  gsc_multi_period?: SeoViewProps["gscMultiPeriod"] | null;
  gsc_synced_at?: string | null;
  maskyoo_snapshots?: ComponentProps<
    typeof PublicMaskyooCallsCard
  >["snapshots"];
  maskyoo_period?: { start: string; end: string } | null;
  seo_monthly?: {
    months?: ComponentProps<typeof PublicSeoMonthlyWorkView>["months"];
    client_name?: string | null;
    domain?: string | null;
    share_token?: string | null;
  } | null;
  seo_keyword_relevance?: {
    force_relevant?: Array<string>;
    force_irrelevant?: Array<string>;
  };
};
