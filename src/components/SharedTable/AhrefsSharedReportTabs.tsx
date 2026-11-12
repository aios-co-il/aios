import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { BarChart3, Phone, Search, TrendingUp } from "lucide-react";
import { GoogleAnalyticsDashboard } from "@/components/dynamic-tables/GoogleAnalyticsDashboard";
import { PublicGscView } from "@/components/dynamic-tables/PublicGscView";
import { PublicMaskyooCallsCard } from "@/components/dynamic-tables/PublicMaskyooCallsCard";
import { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";
import {
  ResponsiveTabsList,
  type ResponsiveTabItem,
} from "@/components/ui/responsive-tabs-list";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { SharedReportTabVisibility } from "@/lib/sharedReportTabs";
import type { SharedSeoPayload } from "./sharedSeoPayload";

type SeoViewProps = ComponentProps<typeof PublicSeoView>;

type Props = {
  hasGsc: boolean;
  hasGa: boolean;
  gscPending: boolean;
  gscRecords: NonNullable<SharedSeoPayload["gsc_records"]>;
  gaRecords: NonNullable<SharedSeoPayload["ga_records"]>;
  gscAggregated: NonNullable<SeoViewProps["gscData"]>;
  gaOrganicByMonth: NonNullable<SeoViewProps["gaOrganicByMonth"]>;
  maskyooSnapshots: NonNullable<SharedSeoPayload["maskyoo_snapshots"]>;
  periodLabel?: string;
  tableName: string;
  tableSettings: Record<string, unknown>;
  clientId: string | null;
  ahrefsReports: SeoViewProps["reports"];
  gscMultiPeriod: SharedSeoPayload["gsc_multi_period"];
  seoKeywordRelevance?: SharedSeoPayload["seo_keyword_relevance"];
  sharedTabs: SharedReportTabVisibility;
};

/** The SEO share's tabs: SEO, Search Console, Analytics and calls, as the share allows. */
export function AhrefsSharedReportTabs({
  hasGsc,
  hasGa,
  gscPending,
  gscRecords,
  gaRecords,
  gscAggregated,
  gaOrganicByMonth,
  maskyooSnapshots,
  periodLabel,
  tableName,
  tableSettings,
  clientId,
  ahrefsReports,
  gscMultiPeriod,
  seoKeywordRelevance,
  sharedTabs,
}: Props) {
  const [activeTab, setActiveTab] = useState("seo");

  const tabItems = useMemo((): Array<ResponsiveTabItem> => {
    const items: Array<ResponsiveTabItem> = [];
    if (sharedTabs.seo) {
      items.push({ value: "seo", label: "SEO", icon: TrendingUp });
    }
    if (hasGsc) {
      items.push({ value: "gsc", label: "Search Console", icon: Search });
    } else if (gscPending) {
      items.push({
        value: "gsc",
        label: "Search Console…",
        icon: Search,
        disabled: true,
      });
    }
    if (hasGa) {
      items.push({ value: "ga", label: "Analytics", icon: BarChart3 });
    }
    if (sharedTabs.maskyoo) {
      items.push({ value: "maskyoo", label: "שיחות מסקיו", icon: Phone });
    }
    return items;
  }, [hasGsc, hasGa, gscPending, sharedTabs]);

  useEffect(() => {
    if (!tabItems.some((item) => item.value === activeTab && !item.disabled)) {
      setActiveTab(tabItems.find((item) => !item.disabled)?.value || "seo");
    }
  }, [activeTab, tabItems]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <ResponsiveTabsList
        items={tabItems}
        value={activeTab}
        onValueChange={setActiveTab}
        mobileLabel="בחר דוח SEO"
      />

      {sharedTabs.seo && (
        <TabsContent value="seo" className="space-y-4">
          {gscPending && (
            <p className="text-sm text-muted-foreground">
              טוען נתוני Search Console…
            </p>
          )}
          <PublicSeoView
            tableName={tableName}
            reports={ahrefsReports}
            gscData={gscAggregated}
            gscMultiPeriod={gscMultiPeriod ?? undefined}
            gaOrganicByMonth={gaOrganicByMonth}
            initialLangFilter={
              (["all", "he", "en"] as const).find(
                (lang) => lang === tableSettings.linkedGscLangFilter,
              ) ?? "all"
            }
            clientId={clientId}
            forceRelevant={seoKeywordRelevance?.force_relevant || []}
            forceIrrelevant={seoKeywordRelevance?.force_irrelevant || []}
          />
        </TabsContent>
      )}

      {hasGsc && (
        <TabsContent value="gsc">
          <PublicGscView records={gscRecords} />
        </TabsContent>
      )}

      {hasGa && (
        <TabsContent value="ga">
          <GoogleAnalyticsDashboard records={gaRecords} />
        </TabsContent>
      )}

      {sharedTabs.maskyoo && (
        <TabsContent value="maskyoo">
          <PublicMaskyooCallsCard
            snapshots={maskyooSnapshots}
            periodLabel={periodLabel}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
