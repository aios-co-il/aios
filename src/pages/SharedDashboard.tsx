import { CampaignContinentsTab } from "@/components/dynamic-tables/CampaignContinents/CampaignContinentsTab";
import {
  googleCampaignNames,
  namesCampaignsByDestination,
} from "@/components/dynamic-tables/CampaignContinents/continentSections";
import type { DashboardPlatformFilter } from "@/lib/dashboardPlatformFilter";
import { GoogleAdsCampaignSection } from "@/components/dynamic-tables/GoogleAdsCampaignSection/GoogleAdsCampaignSection";
import { DashboardTrackedEvents } from "@/components/dynamic-tables/TrackedEvents/DashboardTrackedEvents";
import { parseTrackedEvents } from "@/components/dynamic-tables/TrackedEvents/trackedEvents";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { CombinedRoasCard } from "@/components/dynamic-tables/CombinedRoasCard";
import { DashboardPlatformBreakdown } from "@/components/dynamic-tables/DashboardPlatformBreakdown/DashboardPlatformBreakdown";
import { DashboardGoalOverview } from "@/components/dynamic-tables/DashboardGoalOverview/DashboardGoalOverview";
import { FacebookReportTab } from "@/components/FacebookReportTab/FacebookReportTab";
import { hasSeveralGoals } from "@/lib/dashboardGoalSummary";
import { useDashboardGoalTotals } from "@/hooks/useDashboardGoalTotals";
import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { GoalReportOverview } from "@/components/report-ui/dashboard/GoalReportOverview";
import { dashboardReportInput } from "@/components/report-ui/dashboard/dashboardReportInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveTabsList,
  type ResponsiveTabItem,
} from "@/components/ui/responsive-tabs-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Facebook,
  FileSpreadsheet,
  Globe,
  MousePointerClick,
  TrendingUp,
  BarChart3,
  RefreshCw,
  ShoppingCart,
  Search,
  FileText,
  Activity,
  Banknote,
  Eye,
  ShoppingBag,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";
import { PublicGscView } from "@/components/dynamic-tables/PublicGscView";
import { PublicMaskyooCallsCard } from "@/components/dynamic-tables/PublicMaskyooCallsCard";
import { PublicSeoMonthlyWorkView } from "@/components/dynamic-tables/PublicSeoMonthlyWorkView";
import { GoogleAnalyticsDashboard } from "@/components/dynamic-tables/GoogleAnalyticsDashboard";
import { PublicWooCommerceView } from "@/components/dynamic-tables/PublicWooCommerceView";
import { WeeklyCampaignComparison } from "@/components/reports/WeeklyCampaignComparison";
import {
  getAddToCartFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSessionsFromData,
  getSpendFromData,
  getUsersFromData,
} from "@/lib/adsMetrics";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  dashboardRecordLeads,
} from "@/lib/dashboardCampaignGoals";
import { weeklySourceModesForTables } from "@/lib/weeklyCampaignGoals";
import {
  formatCurrency as formatCurrencyAmount,
  formatUnitCost as formatUnitCostAmount,
  getCurrencySymbol,
  resolveDashboardCurrency,
} from "@/lib/currency";
import { resolveAnalyticsReportMode } from "@/lib/analyticsReportMode";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { SHARED_COMBINED_DASHBOARD_DATE_FILTERS } from "@/lib/dashboardDateFilters";
import {
  shouldUseGoogleWooAttributionOverlay,
  summarizeGoogleAttributedWooOrders,
} from "@/lib/wooAttribution";
import {
  filterWooOrdersForRevenue,
  sumWooRevenue,
} from "@/lib/wooOrderRevenue";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";

const DATE_FILTERS = SHARED_COMBINED_DASHBOARD_DATE_FILTERS;

const PLATFORM_CONFIG: Record<string, { name: string; color: string }> = {
  facebook_insights: { name: "Facebook", color: "text-blue-600" },
  facebook_ecommerce: { name: "Facebook", color: "text-blue-600" },
  google_ads: { name: "Google Ads", color: "text-red-500" },
  google_analytics: { name: "Analytics", color: "text-orange-500" },
};

const hasMeaningfulAnalyticsMetrics = (data: any) =>
  getSessionsFromData(data) > 0 ||
  getUsersFromData(data) > 0 ||
  getPurchasesFromData(data) > 0 ||
  getRevenueFromData(data) > 0 ||
  getAddToCartFromData(data) > 0;
const isAdsPlatform = (s: string) =>
  ["facebook_insights", "facebook_ecommerce", "google_ads"].includes(s);
const isAnalyticsPlatform = (s: string) => s === "google_analytics";
const isFacebookPlatform = (s: string) =>
  ["facebook_insights", "facebook_ecommerce"].includes(s);
const normalizePlatformKey = (s: string) =>
  isFacebookPlatform(s) ? "facebook_insights" : s;

const matchesPlatformFilter = (
  integrationType: string,
  filter: DashboardPlatformFilter,
): boolean => {
  if (filter === "all") return true;
  if (filter === "facebook") return isFacebookPlatform(integrationType);
  if (filter === "google_ads") return integrationType === "google_ads";
  if (filter === "google_analytics")
    return isAnalyticsPlatform(integrationType);
  return true;
};

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return Math.round(num).toString();
};

const getIntegrationIcon = (type: string | null) => {
  switch (type) {
    case "facebook_insights":
    case "facebook_ecommerce":
      return <Facebook className="h-5 w-5 text-blue-600" />;
    case "google_ads":
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
          <path
            d="M3.654 14.916l6.26-10.857c.68-1.18 2.184-1.59 3.361-.916l.004.003c1.178.68 1.586 2.184.909 3.361l-6.26 10.857c-.68 1.18-2.184 1.59-3.361.916l-.004-.003c-1.178-.68-1.586-2.184-.909-3.361z"
            fill="#FBBC04"
          />
          <path
            d="M14.088 14.916l6.26-10.857c.68-1.18.27-2.684-.909-3.361l-.004-.003c-1.177-.674-2.681-.264-3.361.916l-6.26 10.857c-.68 1.18-.27 2.684.909 3.361l.004.003c1.177.674 2.681.264 3.361-.916z"
            fill="#4285F4"
          />
          <circle cx="6" cy="18" r="3.5" fill="#34A853" />
        </svg>
      );
    case "google_analytics":
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
          <path
            d="M20.5 18.5v-13c0-1.1-.9-2-2-2h-1c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2z"
            fill="#F9AB00"
          />
          <path
            d="M13.5 18.5v-7c0-1.1-.9-2-2-2h-1c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2z"
            fill="#E37400"
          />
          <circle cx="5" cy="18.5" r="2.5" fill="#E37400" />
        </svg>
      );
    default:
      return <FileSpreadsheet className="h-5 w-5" />;
  }
};

interface SharedDashboardProps {
  shareTokenOverride?: string;
  /** Snapshot/report capture — matches the combined dashboard default window. */
  initialDateFilter?: string;
  /** Hide refresh/date controls when rendering off-screen for report capture. */
  snapshotMode?: boolean;
}

export default function SharedDashboard({
  shareTokenOverride,
  initialDateFilter = "last_30_days",
  snapshotMode = false,
}: SharedDashboardProps = {}) {
  const params = useParams();
  const shareToken = shareTokenOverride ?? params.shareToken;
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  const [platformFilter, setPlatformFilter] =
    useState<DashboardPlatformFilter>("all");
  const [seoActiveTab, setSeoActiveTab] = useState("seo");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-dashboard", shareToken, dateFilter],
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !apiKey) {
        throw new Error(
          "חסרה הגדרת Supabase בסביבת הפיתוח (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)",
        );
      }
      const params = new URLSearchParams({
        token: shareToken!,
        date_filter: dateFilter,
      });
      const baseUrl = `${supabaseUrl}/functions/v1/public-dashboard`;
      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        method: "GET",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `public-dashboard failed (${res.status})`);
      }
      return res.json();
    },
    enabled: !!shareToken,
    retry: false,
    // Keep a warm cache so reopening / date flips don't flash a blank screen.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const tables = data?.tables || [];
  const rawRecords = data?.records || [];

  const { data: weeklyData, isPending: weeklyPending } = useQuery({
    queryKey: ["shared-dashboard", shareToken, "last_365_days", "weekly"],
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const query = new URLSearchParams({
        token: shareToken!,
        date_filter: "last_365_days",
      });
      const res = await fetch(
        `${supabaseUrl}/functions/v1/public-dashboard?${query}`,
        {
          headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!shareToken && platformFilter === "weekly",
    staleTime: 5 * 60_000,
    retry: false,
  });
  const dashboardCurrency = useMemo(
    () => resolveDashboardCurrency(tables),
    [tables],
  );
  const formatCurrency = (num: number) =>
    formatCurrencyAmount(num, dashboardCurrency);
  const formatUnitCost = (num: number) =>
    formatUnitCostAmount(num, dashboardCurrency);

  // Deduplicate Facebook: if both facebook_insights AND facebook_ecommerce exist,
  // skip facebook_insights records to avoid double-counting spend/impressions/clicks
  const records = useMemo(() => {
    const hasFbEcommerce = tables.some(
      (t: any) => t.integration_type === "facebook_ecommerce",
    );
    const hasFbInsights = tables.some(
      (t: any) => t.integration_type === "facebook_insights",
    );
    if (hasFbEcommerce && hasFbInsights) {
      return rawRecords.filter((r: any) => r._source !== "facebook_insights");
    }
    return rawRecords;
  }, [rawRecords, tables]);

  const weeklyRecords = useMemo(() => {
    const source = weeklyData?.records || [];
    const hasFbEcommerce = tables.some(
      (t: any) => t.integration_type === "facebook_ecommerce",
    );
    const hasFbInsights = tables.some(
      (t: any) => t.integration_type === "facebook_insights",
    );
    return hasFbEcommerce && hasFbInsights
      ? source.filter((record: any) => record._source !== "facebook_insights")
      : source;
  }, [weeklyData?.records, tables]);

  const wooSites = data?.woocommerce?.sites || [];
  const wooOrders = data?.woocommerce?.orders || [];
  const hasWooCommerce = wooSites.length > 0;
  const ahrefsReports = data?.ahrefs_reports || [];
  const hasSeo = ahrefsReports.length > 0;
  const seoGaRecords = data?.seo_ga_records || [];
  const seoGscRecords = data?.seo_gsc_records || [];
  const gscMultiPeriod = data?.gsc_multi_period || null;
  const maskyooSnapshots = data?.maskyoo_snapshots || [];
  const maskyooPeriod = data?.maskyoo_period || null;
  const maskyooPeriodLabel = maskyooPeriod
    ? `${maskyooPeriod.start} – ${maskyooPeriod.end}`
    : undefined;
  const hasSeoMaskyoo = maskyooSnapshots.length > 0;
  const hasSeoGsc = seoGscRecords.length > 0;
  const hasSeoGa = seoGaRecords.length > 0;
  const seoMonthly = (data as any)?.seo_monthly || null;
  const hasMonthlyWork =
    Array.isArray(seoMonthly?.months) && seoMonthly.months.length > 0;
  console.log(
    "[SharedDashboard] wooSites:",
    wooSites.length,
    "wooOrders:",
    wooOrders.length,
    "seoReports:",
    ahrefsReports.length,
    "seoGA:",
    seoGaRecords.length,
    "seoGSC:",
    seoGscRecords.length,
  );

  // Aggregate GSC records per keyword (sum clicks/impressions, weighted-avg position)
  const seoGscAggregated = useMemo(() => {
    if (seoGscRecords.length === 0)
      return [] as {
        keyword: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }[];
    const acc = new Map<
      string,
      { clicks: number; impressions: number; positionWeighted: number }
    >();
    for (const rec of seoGscRecords) {
      const d = (rec as any).data || rec;
      const kw = String(d.query || d.keyword || "").trim();
      if (!kw) continue;
      const clicks = Number(d.clicks) || 0;
      const impressions = Number(d.impressions) || 0;
      const position = Number(d.position) || 0;
      const cur = acc.get(kw) || {
        clicks: 0,
        impressions: 0,
        positionWeighted: 0,
      };
      cur.clicks += clicks;
      cur.impressions += impressions;
      cur.positionWeighted += position * impressions;
      acc.set(kw, cur);
    }
    return Array.from(acc.entries()).map(([keyword, v]) => ({
      keyword,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr:
        v.impressions > 0
          ? Math.round((v.clicks / v.impressions) * 10000) / 100
          : 0,
      position:
        v.impressions > 0
          ? Math.round((v.positionWeighted / v.impressions) * 10) / 10
          : 0,
    }));
  }, [seoGscRecords]);

  // Compute GA monthly non-paid sessions for the SEO traffic chart (mirrors SeoDashboardView).
  const seoGaOrganicByMonth = useMemo(() => {
    if (seoGaRecords.length === 0)
      return [] as { month: string; sessions: number }[];
    const isPaidChannel = (cg: string) => {
      const v = cg.toLowerCase();
      return (
        v.startsWith("paid") ||
        v === "cross-network" ||
        v === "display" ||
        v.includes("paid")
      );
    };
    const isPaidMedium = (sm: string) => {
      const v = sm.toLowerCase();
      return /\b(cpc|ppc|paid|cpm|cpv|paidsearch|display)\b/.test(v);
    };

    // Prefer monthly_channel records
    const monthlyChannelRows = seoGaRecords.filter(
      (r: any) => r.data?.report_type === "monthly_channel",
    );
    if (monthlyChannelRows.length > 0) {
      const monthMap = new Map<string, number>();
      for (const r of monthlyChannelRows) {
        const cg = String(r.data?.channel_group || "");
        if (isPaidChannel(cg)) continue;
        const month = r.data?.month as string;
        if (!month) continue;
        monthMap.set(
          month,
          (monthMap.get(month) || 0) + (Number(r.data?.sessions) || 0),
        );
      }
      if (monthMap.size > 0) {
        return Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, sessions]) => ({ month, sessions }));
      }
    }

    // Fallback: daily_source (exclude paid mediums)
    const dailySourceRows = seoGaRecords.filter(
      (r: any) => r.data?.report_type === "daily_source",
    );
    if (dailySourceRows.length > 0) {
      const monthMap = new Map<string, number>();
      for (const r of dailySourceRows) {
        const sm = String(r.data?.source_medium || "");
        if (isPaidMedium(sm)) continue;
        const date = r.data?.date;
        if (!date) continue;
        const monthKey = String(date).substring(0, 7);
        monthMap.set(
          monthKey,
          (monthMap.get(monthKey) || 0) + (Number(r.data?.sessions) || 0),
        );
      }
      if (monthMap.size > 0) {
        return Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, sessions]) => ({ month, sessions }));
      }
    }

    // Last fallback: monthly_organic
    return seoGaRecords
      .filter((r: any) => r.data?.report_type === "monthly_organic")
      .map((r: any) => ({
        month: r.data.month as string,
        sessions: Number(r.data.sessions) || 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [seoGaRecords]);

  const hasVisibleAnalyticsData = useMemo(() => {
    return records.some((record: any) => {
      const source = record._source || "";
      const recordData = record.data || {};
      return (
        isAnalyticsPlatform(source) &&
        recordData.report_type === "daily" &&
        hasMeaningfulAnalyticsMetrics(recordData)
      );
    });
  }, [records]);

  // Available platforms
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t: any) => {
      if (t?.integration_type) set.add(t.integration_type);
    });
    const platforms: DashboardPlatformFilter[] = [];
    if (set.has("facebook_insights") || set.has("facebook_ecommerce"))
      platforms.push("facebook");
    if (set.has("google_ads")) platforms.push("google_ads");
    if (set.has("google_analytics") && hasVisibleAnalyticsData)
      platforms.push("google_analytics");
    if (hasWooCommerce) platforms.push("woocommerce");
    if (hasSeo) platforms.push("seo");
    return platforms;
  }, [tables, hasWooCommerce, hasSeo, hasVisibleAnalyticsData]);

  // Travel accounts name each campaign by its destination; they get a tab per continent.
  const hasContinentsTab = useMemo(
    () => namesCampaignsByDestination(googleCampaignNames(records)),
    [records],
  );
  // A period whose campaigns stop naming destinations drops the tab; leave it too.
  useEffect(() => {
    if (platformFilter === "continents" && !hasContinentsTab) {
      setPlatformFilter("google_ads");
    }
  }, [platformFilter, hasContinentsTab]);

  // A dashboard that follows site events gets their tab; no picker on a share link.
  const hasTrackedEvents =
    parseTrackedEvents(data?.dashboard?.settings).length > 0;

  const platformTabItems = useMemo((): ResponsiveTabItem[] => {
    const items: ResponsiveTabItem[] = [{ value: "all", label: "📊 הכל" }];
    if (
      availablePlatforms.includes("facebook") ||
      availablePlatforms.includes("google_ads")
    ) {
      items.push({
        value: "weekly",
        label: "השוואה שבועית",
        iconNode: <BarChart3 className="h-4 w-4 text-violet-600" />,
      });
    }
    if (availablePlatforms.includes("facebook")) {
      items.push({
        value: "facebook",
        label: "Facebook",
        iconNode: <Facebook className="h-4 w-4 text-blue-600" />,
      });
    }
    if (availablePlatforms.includes("google_ads")) {
      items.push({
        value: "google_ads",
        label: "Google Ads",
        iconNode: getIntegrationIcon("google_ads"),
      });
      if (hasContinentsTab) {
        items.push({
          value: "continents",
          label: "לפי יבשות",
          iconNode: <Globe className="h-4 w-4 text-sky-600" />,
        });
      }
    }
    if (availablePlatforms.includes("google_analytics")) {
      items.push({
        value: "google_analytics",
        label: "Analytics",
        iconNode: getIntegrationIcon("google_analytics"),
      });
    }
    if (hasTrackedEvents) {
      items.push({
        value: "site_events",
        label: "אירועים באתר",
        iconNode: <MousePointerClick className="h-4 w-4 text-indigo-600" />,
      });
    }
    if (availablePlatforms.includes("woocommerce")) {
      items.push({
        value: "woocommerce",
        label: "WooCommerce",
        iconNode: <ShoppingCart className="h-4 w-4 text-emerald-600" />,
      });
    }
    if (availablePlatforms.includes("seo")) {
      items.push({
        value: "seo",
        label: "SEO",
        iconNode: <Search className="h-4 w-4 text-purple-600" />,
      });
    }
    return items;
  }, [availablePlatforms, hasContinentsTab, hasTrackedEvents]);

  const seoTabItems = useMemo((): ResponsiveTabItem[] => {
    const items: ResponsiveTabItem[] = [
      { value: "seo", label: "SEO", icon: TrendingUp },
    ];
    if (hasSeoGsc) {
      items.push({ value: "gsc", label: "Search Console", icon: Search });
    }
    if (hasSeoGa) {
      items.push({ value: "ga", label: "Analytics", icon: BarChart3 });
    }
    items.push({
      value: "monthly-work",
      label: "עבודה שבוצעה",
      icon: FileText,
    });
    return items;
  }, [hasSeoGsc, hasSeoGa]);

  useEffect(() => {
    if (!seoTabItems.some((item) => item.value === seoActiveTab)) {
      setSeoActiveTab(seoTabItems[0]?.value || "seo");
    }
  }, [seoActiveTab, seoTabItems]);

  // Filter records: platform filter + only use 'daily' aggregate records for Analytics
  const filteredRecords = useMemo(() => {
    return records.filter((record: any) => {
      const source = record._source || "unknown";
      if (!matchesPlatformFilter(source, platformFilter)) return false;
      if (isAnalyticsPlatform(source)) {
        if (!hasVisibleAnalyticsData) return false;
        const data = record.data || {};
        if (data.report_type !== "daily") return false;
      }
      if (
        isAdsPlatform(source) &&
        !shouldIncludeInAdsDashboardAggregate(record.data, source)
      )
        return false;
      return true;
    });
  }, [records, platformFilter, hasVisibleAnalyticsData]);

  // All analytics records (unfiltered by report_type) for GoogleAnalyticsDashboard
  const allAnalyticsRecords = useMemo(() => {
    if (!hasVisibleAnalyticsData) return [];
    return records
      .filter((r: any) => isAnalyticsPlatform(r._source || ""))
      .map((r: any) => ({ id: r.id, data: r.data }));
  }, [records, hasVisibleAnalyticsData]);

  // Each ads campaign's goal as its report shows it (_shared/campaign-goal/).
  const recordGoalOf = useMemo(
    () => dashboardRecordGoalOf(records, tables),
    [records, tables],
  );

  // Delivery and spend by platform, and Analytics results. Ads results are
  // counted per goal in dashboardGoals, as the reports count them.
  const summaryByPlatform = useMemo(() => {
    const platforms: Record<string, any> = {};
    filteredRecords.forEach((record: any) => {
      const rawSource = record._source || "unknown";
      const source = normalizePlatformKey(rawSource);
      if (!platforms[source]) {
        platforms[source] = {
          spend: 0,
          impressions: 0,
          clicks: 0,
          sessions: 0,
          users: 0,
          results: 0,
          revenue: 0,
          addToCart: 0,
        };
      }
      const d = record.data || {};
      if (isAnalyticsPlatform(source)) {
        platforms[source].sessions += getSessionsFromData(d);
        platforms[source].users += getUsersFromData(d);
        platforms[source].results += getPurchasesFromData(d);
        platforms[source].revenue += getRevenueFromData(d);
        platforms[source].addToCart += getAddToCartFromData(d);
      } else {
        platforms[source].spend += getSpendFromData(d);
        platforms[source].impressions += Number(d.impressions) || 0;
        platforms[source].clicks += Number(d.clicks) || 0;
      }
    });
    return platforms;
  }, [filteredRecords]);

  // Global ads metrics (regardless of platform filter) for Analytics tab ROAS
  const globalAdsMetrics = useMemo(() => {
    let spend = 0,
      impressions = 0;
    records.forEach((record: any) => {
      const source = record._source || "unknown";
      if (isAdsPlatform(source)) {
        const data = record.data || {};
        if (data.report_type && data.report_type !== "daily") return;
        if (!shouldIncludeInAdsDashboardAggregate(data, source)) return;
        spend += getSpendFromData(data);
        impressions += Number(data.impressions) || 0;
      }
    });
    return { spend, impressions };
  }, [records]);

  const totalSummary = useMemo(() => {
    let totalSpend = 0,
      totalImpressions = 0,
      totalClicks = 0;
    let adsSpend = 0;
    let analyticsRevenue = 0,
      analyticsPurchases = 0,
      analyticsAddToCart = 0,
      analyticsSessions = 0,
      analyticsUsers = 0;
    Object.entries(summaryByPlatform).forEach(
      ([platform, d]: [string, any]) => {
        if (isAnalyticsPlatform(platform)) {
          analyticsRevenue += d.revenue;
          analyticsPurchases += d.results;
          analyticsAddToCart += d.addToCart;
          analyticsSessions += d.sessions;
          analyticsUsers += d.users || 0;
        } else if (isAdsPlatform(platform)) {
          totalSpend += d.spend;
          totalImpressions += d.impressions;
          totalClicks += d.clicks;
          adsSpend += d.spend;
        }
      },
    );
    const effectiveSpend = totalSpend > 0 ? totalSpend : globalAdsMetrics.spend;
    const effectiveAdsSpend = adsSpend > 0 ? adsSpend : globalAdsMetrics.spend;
    const effectiveImpressions =
      totalImpressions > 0 ? totalImpressions : globalAdsMetrics.impressions;
    return {
      spend: effectiveSpend,
      impressions: effectiveImpressions,
      clicks: totalClicks,
      revenue: analyticsRevenue,
      roas_spend: effectiveAdsSpend,
      roas_value: analyticsRevenue,
      analyticsPurchases,
      analyticsAddToCart,
      analyticsSessions,
      analyticsUsers,
    };
  }, [summaryByPlatform, globalAdsMetrics]);

  // WooCommerce summary — aligns with PublicWooCommerceView so the "All" tab
  // KPI cards match the WooCommerce tab exactly.
  const wooSummary = useMemo(() => {
    const valid = filterWooOrdersForRevenue(wooOrders, null);
    const revenue = sumWooRevenue(valid);
    const orderCount = valid.length;
    const googlePaid = summarizeGoogleAttributedWooOrders(valid);
    return { revenue, orderCount, googlePaid };
  }, [wooOrders]);

  const hasWooData =
    hasWooCommerce && (wooSummary.revenue > 0 || wooSummary.orderCount > 0);

  // The per-goal report on the overview. public-dashboard takes presets only
  // and caps each table's rows newest-first, so a wider preset would cut the
  // earlier period short: the shared report shows no previous-period change.
  const reportCurrent = useMemo(
    () =>
      dashboardReportInput({
        records,
        tables,
        woo: hasWooCommerce
          ? { revenue: wooSummary.revenue, orders: wooSummary.orderCount }
          : null,
      }),
    [records, tables, hasWooCommerce, wooSummary],
  );

  // Analytics source breakdown
  const analyticsSourceBreakdown = useMemo(() => {
    if (!hasVisibleAnalyticsData) return [];
    const categorize = (sourceMedium: string): string => {
      const sm = sourceMedium.toLowerCase();
      if (sm.includes("facebook") || sm.includes("fb")) {
        if (sm.includes("paid") || sm.includes("cpc") || sm.includes("cpm"))
          return "Facebook ממומן";
        return "Facebook אורגני";
      }
      if (sm.includes("instagram") || sm.includes("ig")) {
        if (sm.includes("paid") || sm.includes("cpc") || sm.includes("cpm"))
          return "Instagram ממומן";
        return "Instagram אורגני";
      }
      if (sm.includes("google") || sm.includes("googleads")) {
        if (sm.includes("organic")) return "Google אורגני";
        if (sm.includes("cpc") || sm.includes("paid") || sm.includes("ads"))
          return "Google ממומן";
        return "Google";
      }
      if (
        sm.includes("email") ||
        sm.includes("newsletter") ||
        sm.includes("mailchimp") ||
        sm.includes("klaviyo") ||
        sm.includes("activetrail")
      )
        return "דיוור";
      if (sm.includes("whatsapp") || sm.includes("wa.me")) return "WhatsApp";
      if (sm.includes("organic") || sm.includes("seo")) return "אורגני";
      if (
        sm === "(direct) / (none)" ||
        sm === "direct" ||
        sm.includes("(direct)") ||
        sm.includes("(none)")
      )
        return "ישיר (Direct)";
      if (sm.includes("referral")) return "הפניות (Referral)";
      return "אחר";
    };

    const sources: Record<
      string,
      {
        sessions: number;
        users: number;
        purchases: number;
        revenue: number;
        addToCart: number;
      }
    > = {};
    records.forEach((record: any) => {
      const source = record._source || "unknown";
      if (!isAnalyticsPlatform(source)) return;
      const data = record.data || {};
      if (data.report_type !== "daily_source") return;
      const sm = data.source_medium || "Unknown";
      const category = categorize(sm);
      if (!sources[category])
        sources[category] = {
          sessions: 0,
          users: 0,
          purchases: 0,
          revenue: 0,
          addToCart: 0,
        };
      sources[category].sessions += Number(data.sessions) || 0;
      sources[category].users += Number(data.users) || 0;
      sources[category].purchases += getPurchasesFromData(data);
      sources[category].revenue += getRevenueFromData(data);
      sources[category].addToCart += getAddToCartFromData(data);
    });
    return Object.entries(sources)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [records, hasVisibleAnalyticsData]);

  // Traffic Acquisition by Channel Group
  const channelGroupBreakdown = useMemo(() => {
    if (!hasVisibleAnalyticsData) return [];
    const channels: Record<
      string,
      {
        sessions: number;
        engagedSessions: number;
        users: number;
        purchases: number;
        revenue: number;
        rateSum: number;
        durationSum: number;
        eventsSum: number;
        count: number;
      }
    > = {};
    records.forEach((record: any) => {
      const source = record._source || "unknown";
      if (!isAnalyticsPlatform(source)) return;
      const data = record.data || {};
      if (data.report_type !== "channel_group") return;
      const ch = data.channel_group || "Unknown";
      if (!channels[ch])
        channels[ch] = {
          sessions: 0,
          engagedSessions: 0,
          users: 0,
          purchases: 0,
          revenue: 0,
          rateSum: 0,
          durationSum: 0,
          eventsSum: 0,
          count: 0,
        };
      channels[ch].sessions += Number(data.sessions) || 0;
      channels[ch].engagedSessions += Number(data.engaged_sessions) || 0;
      channels[ch].users += Number(data.users) || 0;
      channels[ch].purchases += getPurchasesFromData(data);
      channels[ch].revenue += getRevenueFromData(data);
      channels[ch].rateSum += Number(data.engagement_rate) || 0;
      channels[ch].durationSum += Number(data.avg_session_duration) || 0;
      channels[ch].eventsSum += Number(data.events_per_session) || 0;
      channels[ch].count += 1;
    });
    return Object.entries(channels)
      .map(([name, d]) => ({
        name,
        sessions: d.sessions,
        engagedSessions: d.engagedSessions,
        engagementRate: d.count > 0 ? d.rateSum / d.count : 0,
        avgDuration: d.count > 0 ? d.durationSum / d.count : 0,
        eventsPerSession: d.count > 0 ? d.eventsSum / d.count : 0,
        users: d.users,
        purchases: d.purchases,
        revenue: d.revenue,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [records, hasVisibleAnalyticsData]);

  // Daily chart data
  const dailyChartData = useMemo(() => {
    const byDate: Record<string, any> = {};
    filteredRecords.forEach((record: any) => {
      const date = record.data?.date;
      if (!date) return;
      const source = record._source || "unknown";
      const data = record.data || {};
      if (!byDate[date]) {
        byDate[date] = {
          date,
          spend: 0,
          revenue: 0,
          purchases: 0,
          addToCart: 0,
          sessions: 0,
          clicks: 0,
          impressions: 0,
          leads: 0,
        };
      }
      if (isAnalyticsPlatform(source)) {
        byDate[date].revenue += getRevenueFromData(data);
        byDate[date].purchases += getPurchasesFromData(data);
        byDate[date].addToCart += getAddToCartFromData(data);
        byDate[date].sessions += getSessionsFromData(data);
      } else if (isAdsPlatform(source)) {
        byDate[date].spend += getSpendFromData(data);
        byDate[date].clicks += Number(data.clicks) || 0;
        byDate[date].impressions += Number(data.impressions) || 0;
        byDate[date].leads += dashboardRecordLeads(record, recordGoalOf);
      }
    });
    return Object.values(byDate)
      .sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
      .map((d: any) => ({
        ...d,
        dateLabel: new Date(d.date).toLocaleDateString("he-IL", {
          day: "2-digit",
          month: "2-digit",
        }),
        roas: d.spend > 0 ? d.revenue / d.spend : 0,
      }));
  }, [filteredRecords, recordGoalOf]);

  // Facebook campaign tables: each campaign under its report's goal.
  const facebookCampaignGroups = useMemo(
    () => dashboardFacebookCampaigns(filteredRecords, recordGoalOf),
    [filteredRecords, recordGoalOf],
  );

  // The "All" tab's goals, store and combined figures, decided as on the
  // other dashboard page.
  const {
    dashboardGoals,
    store,
    dashboardCampaignType,
    combinedSales,
    combinedLeads,
  } = useDashboardGoalTotals({
    showAll: platformFilter === "all",
    facebook: facebookCampaignGroups,
    records: filteredRecords,
    tables,
    woo: { revenue: wooSummary.revenue, orders: wooSummary.orderCount },
  });

  const googleAdsSummary = useMemo(
    () =>
      summarizeGoogleAdsCampaigns(
        records.filter(
          (r: { _source?: string }) => (r._source || "") === "google_ads",
        ),
        tables || [],
      ),
    [records, tables],
  );
  const googleAdsCampaignType = googleAdsSummary.hasEcommerce
    ? "ecommerce"
    : "leads";

  const googleAdsTableSettings = useMemo(() => {
    const gaTables = (tables || []).filter(
      (t: any) => t.integration_type === "google_ads",
    );
    return (
      gaTables.find(
        (t: any) => t.integration_settings?.use_woo_google_attribution != null,
      )?.integration_settings ?? gaTables[0]?.integration_settings
    );
  }, [tables]);

  const googleWooAttribution = wooSummary.googlePaid;
  const useGoogleWooOverlay =
    hasWooCommerce &&
    googleAdsCampaignType === "ecommerce" &&
    shouldUseGoogleWooAttributionOverlay(
      data?.dashboard?.client_id,
      googleAdsTableSettings,
    );

  const analyticsTableIds = useMemo(
    () =>
      (tables || [])
        .filter((t: any) => t.integration_type === "google_analytics")
        .map((t: any) => t.id as string),
    [tables],
  );

  const analyticsReportMode = useMemo(
    () =>
      resolveAnalyticsReportMode({
        dashboardMode: (data?.dashboard as any)?.settings?.default_report_mode,
        tables,
      }),
    [data?.dashboard, tables],
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.dashboard) {
    const detail = error instanceof Error ? error.message : "";
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        dir="rtl"
        data-snapshot-error={detail || "load_failed"}
      >
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-bold mb-2">לא ניתן לטעון את הדוח</h2>
            <p className="text-muted-foreground">
              {detail || "קישור השיתוף אינו פעיל או שפג תוקפו."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dashboard = data.dashboard;
  const showAnalyticsCards =
    (platformFilter === "all" || platformFilter === "google_analytics") &&
    hasVisibleAnalyticsData &&
    totalSummary.analyticsSessions > 0;
  const showAdsCards =
    platformFilter === "all" ||
    platformFilter === "facebook" ||
    platformFilter === "google_ads";
  // Revenue cubes should appear with WooCommerce alone (no GA required)
  const showRevenueCards =
    (platformFilter === "all" ||
      platformFilter === "google_analytics" ||
      platformFilter === "woocommerce") &&
    (showAnalyticsCards || hasWooData);

  const isSnapshotReady =
    !isLoading && !!data?.dashboard && Array.isArray(tables);

  return (
    <div
      className="container mx-auto max-w-full overflow-x-hidden py-4 px-3 sm:py-8 sm:px-4 space-y-6"
      dir="rtl"
      data-snapshot-ready={isSnapshotReady ? "true" : "false"}
      data-snapshot-frame="true"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-xl md:text-3xl font-bold">{dashboard.name}</h1>
          </div>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
            <span>{dashboard.client_name}</span>
            {dashboard.agency_name && (
              <>
                <span>•</span>
                <span>{dashboard.agency_name}</span>
              </>
            )}
          </div>
        </div>
        {!snapshotMode && (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await queryClient.invalidateQueries({
                    queryKey: ["shared-dashboard", shareToken],
                  });
                } finally {
                  setIsRefreshing(false);
                }
              }}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`ml-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              רענן נתונים
            </Button>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Platform Tabs */}
      {platformTabItems.length > 1 && (
        <Tabs
          value={platformFilter}
          onValueChange={(v) => setPlatformFilter(v as DashboardPlatformFilter)}
        >
          <ResponsiveTabsList
            items={platformTabItems}
            value={platformFilter}
            onValueChange={(v) =>
              setPlatformFilter(v as DashboardPlatformFilter)
            }
            mobileLabel="בחר פלטפורמה"
          />
        </Tabs>
      )}

      {/* Analytics Tab → Full GoogleAnalyticsDashboard */}
      {platformFilter === "site_events" ? (
        <DashboardTrackedEvents
          records={records}
          settings={data?.dashboard?.settings}
          adsSpend={globalAdsMetrics.spend}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          source={shareToken ? { shareToken } : null}
          dateFilter={dateFilter}
        />
      ) : platformFilter === "continents" ? (
        <CampaignContinentsTab
          campaigns={googleAdsSummary.campaigns}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          formatUnitCost={formatUnitCost}
        />
      ) : platformFilter === "weekly" ? (
        <WeeklyCampaignComparison
          records={weeklyRecords}
          currency={getCurrencySymbol(dashboardCurrency)}
          isLoading={weeklyPending}
          tables={tables}
          sourceModes={weeklySourceModesForTables(tables)}
        />
      ) : platformFilter === "google_analytics" ? (
        <GoogleAnalyticsDashboard
          records={allAnalyticsRecords}
          externalDateFilter={dateFilter}
          tableId={analyticsTableIds[0]}
          relatedTableIds={analyticsTableIds.slice(1)}
          defaultReportMode={analyticsReportMode}
        />
      ) : platformFilter === "woocommerce" ? (
        <PublicWooCommerceView sites={wooSites} orders={wooOrders} />
      ) : platformFilter === "seo" ? (
        <Tabs
          value={seoActiveTab}
          onValueChange={setSeoActiveTab}
          className="w-full"
        >
          <ResponsiveTabsList
            items={seoTabItems}
            value={seoActiveTab}
            onValueChange={setSeoActiveTab}
            mobileLabel="בחר דוח SEO"
          />
          <TabsContent value="seo" className="space-y-4">
            <PublicSeoView
              tableName={dashboard?.client_name || "SEO"}
              reports={ahrefsReports}
              gscData={seoGscAggregated}
              gscMultiPeriod={gscMultiPeriod}
              gaOrganicByMonth={seoGaOrganicByMonth}
              clientId={dashboard?.client_id || null}
              forceRelevant={
                (data as any)?.seo_keyword_relevance?.force_relevant || []
              }
              forceIrrelevant={
                (data as any)?.seo_keyword_relevance?.force_irrelevant || []
              }
            />
            <PublicMaskyooCallsCard
              snapshots={maskyooSnapshots}
              periodLabel={maskyooPeriodLabel}
            />
          </TabsContent>
          {hasSeoGsc && (
            <TabsContent value="gsc">
              <PublicGscView records={seoGscRecords} />
            </TabsContent>
          )}
          {hasSeoGa && (
            <TabsContent value="ga">
              <GoogleAnalyticsDashboard
                records={seoGaRecords}
                defaultReportMode={analyticsReportMode}
              />
            </TabsContent>
          )}
          <TabsContent value="monthly-work">
            <PublicSeoMonthlyWorkView
              clientName={
                seoMonthly?.client_name ||
                dashboard?.client_name ||
                dashboard?.name
              }
              domain={seoMonthly?.domain || null}
              months={hasMonthlyWork ? seoMonthly.months : []}
              shareToken={seoMonthly?.share_token || null}
              ahrefsReports={ahrefsReports}
              forceRelevant={
                (data as any)?.seo_keyword_relevance?.force_relevant || []
              }
              forceIrrelevant={
                (data as any)?.seo_keyword_relevance?.force_irrelevant || []
              }
            />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {platformFilter === "all" && (
            <GoalReportOverview
              current={reportCurrent}
              previous={null}
              currency={dashboardCurrency}
            />
          )}
          {/* Summary Cards - "All" tab: 7 KPI cards like DashboardView */}
          {platformFilter === "all" && hasSeveralGoals(dashboardGoals) && (
            <DashboardGoalOverview
              summary={dashboardGoals}
              sales={combinedSales}
              leads={combinedLeads}
              delivery={totalSummary}
              platformLabel={(platform) => ({
                ...PLATFORM_CONFIG[platform],
                icon: getIntegrationIcon(platform),
              })}
              format={{ formatCurrency, formatNumber, formatUnitCost }}
            />
          )}
          {platformFilter === "all" && !hasSeveralGoals(dashboardGoals) && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 auto-rows-fr">
              {(showAdsCards || showAnalyticsCards) && (
                <ReportKpiCard
                  icon={Wallet}
                  label="הוצאה כוללת"
                  value={formatCurrency(totalSummary.spend)}
                />
              )}

              {dashboardCampaignType === "ecommerce" ? (
                <>
                  {showAdsCards && (
                    <ReportKpiCard
                      icon={Eye}
                      label="סה״כ חשיפות"
                      value={formatNumber(totalSummary.impressions)}
                    />
                  )}
                  {showAdsCards && (
                    <ReportKpiCard
                      icon={MousePointerClick}
                      label="סה״כ קליקים"
                      value={formatNumber(totalSummary.clicks)}
                    />
                  )}
                  {showAdsCards && combinedLeads.leads > 0 && (
                    <ReportKpiCard
                      icon={Users}
                      label="לידים"
                      value={formatNumber(combinedLeads.leads)}
                    />
                  )}
                  {showAdsCards && combinedLeads.leads > 0 && (
                    <ReportKpiCard
                      icon={Tag}
                      label="עלות לליד (CPL)"
                      value={formatCurrency(combinedLeads.cpl)}
                    />
                  )}
                  {showRevenueCards && (
                    <ReportKpiCard
                      icon={Banknote}
                      label={
                        hasWooData ? "סה״כ הכנסות (WooCommerce)" : "סה״כ הכנסות"
                      }
                      value={formatCurrency(
                        hasWooData ? wooSummary.revenue : totalSummary.revenue,
                      )}
                    />
                  )}
                  {showRevenueCards &&
                    ((hasWooData && wooSummary.orderCount > 0) ||
                      totalSummary.analyticsPurchases > 0 ||
                      dashboardGoals.goals.ecommerce.purchases > 0) && (
                      <ReportKpiCard
                        icon={ShoppingBag}
                        label={
                          hasWooData
                            ? "רכישות (WooCommerce)"
                            : "רכישות (Analytics)"
                        }
                        value={formatNumber(
                          hasWooData
                            ? wooSummary.orderCount
                            : totalSummary.analyticsPurchases ||
                                dashboardGoals.goals.ecommerce.purchases,
                        )}
                      />
                    )}
                  {showAnalyticsCards &&
                    totalSummary.analyticsAddToCart > 0 && (
                      <ReportKpiCard
                        icon={ShoppingCart}
                        label="הוספה לעגלה (ATC)"
                        value={formatNumber(totalSummary.analyticsAddToCart)}
                      />
                    )}
                  {(platformFilter === "all" ||
                    platformFilter === "google_analytics" ||
                    platformFilter === "woocommerce") && (
                    <CombinedRoasCard
                      sales={combinedSales}
                      formatCurrency={formatCurrency}
                    />
                  )}
                </>
              ) : (
                <>
                  {showAdsCards && (
                    <ReportKpiCard
                      icon={Users}
                      label="לידים"
                      value={formatNumber(combinedLeads.leads)}
                    />
                  )}
                  {showAdsCards && (
                    <ReportKpiCard
                      icon={MousePointerClick}
                      label="קליקים"
                      value={formatNumber(totalSummary.clicks)}
                    />
                  )}
                  {showAdsCards && (
                    <ReportKpiCard
                      icon={Tag}
                      label="עלות לליד (CPL)"
                      value={formatCurrency(combinedLeads.cpl)}
                    />
                  )}
                  {showAnalyticsCards && (
                    <ReportKpiCard
                      icon={Activity}
                      label="סשנים (Analytics)"
                      value={formatNumber(totalSummary.analyticsSessions)}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {platformFilter === "facebook" && (
            <FacebookReportTab
              campaigns={facebookCampaignGroups}
              records={filteredRecords}
              tables={tables}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              formatUnitCost={formatUnitCost}
            />
          )}

          {platformFilter === "google_ads" && (
            <GoogleAdsCampaignSection
              summary={googleAdsSummary}
              icon={getIntegrationIcon("google_ads")}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              formatUnitCost={formatUnitCost}
              woo={useGoogleWooOverlay ? googleWooAttribution : null}
            />
          )}

          {/* Platform Breakdown Table */}
          {dashboardGoals.rows.length > 0 && platformFilter === "all" && (
            <DashboardPlatformBreakdown
              summary={dashboardGoals}
              sales={combinedSales}
              leads={combinedLeads}
              revenueSource={store?.source ?? null}
              platformLabel={(platform) => ({
                ...PLATFORM_CONFIG[platform],
                icon: getIntegrationIcon(platform),
              })}
              format={{ formatCurrency, formatNumber, formatUnitCost }}
            />
          )}

          {/* Snapshot end marker — limits screenshot to KPIs + Platform Breakdown */}
          <div data-snapshot-end="true" aria-hidden="true" />

          {/* Analytics Source Breakdown */}
          {analyticsSourceBreakdown.length > 0 && platformFilter === "all" && (
            <Card>
              <CardHeader>
                <CardTitle>פירוט לפי מקור הגעה (Analytics)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">
                          מקור / מדיום
                        </TableHead>
                        <TableHead className="text-right">סשנים</TableHead>
                        <TableHead className="text-right">
                          משתמשים יחודיים
                        </TableHead>
                        {dashboardCampaignType === "ecommerce" && (
                          <>
                            <TableHead className="text-right">
                              הוספה לעגלה
                            </TableHead>
                            <TableHead className="text-right">רכישות</TableHead>
                            <TableHead className="text-right">הכנסות</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsSourceBreakdown.map((source) => (
                        <TableRow key={source.name}>
                          <TableCell className="font-medium">
                            {source.name}
                          </TableCell>
                          <TableCell>{formatNumber(source.sessions)}</TableCell>
                          <TableCell>{formatNumber(source.users)}</TableCell>
                          {dashboardCampaignType === "ecommerce" && (
                            <>
                              <TableCell>
                                {formatNumber(source.addToCart)}
                              </TableCell>
                              <TableCell>
                                {formatNumber(source.purchases)}
                              </TableCell>
                              <TableCell>
                                {formatCurrency(source.revenue)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Traffic Acquisition by Channel Group */}
          {channelGroupBreakdown.length > 0 && platformFilter === "all" && (
            <Card>
              <CardHeader>
                <CardTitle>טרפיק לפי ערוץ (Traffic Acquisition)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">
                          Channel Group
                        </TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">
                          Engaged Sessions
                        </TableHead>
                        <TableHead className="text-right">
                          Engagement Rate
                        </TableHead>
                        <TableHead className="text-right">
                          Avg. Engagement Time
                        </TableHead>
                        <TableHead className="text-right">
                          Events / Session
                        </TableHead>
                        <TableHead className="text-right">Users</TableHead>
                        {dashboardCampaignType === "ecommerce" && (
                          <>
                            <TableHead className="text-right">רכישות</TableHead>
                            <TableHead className="text-right">הכנסות</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channelGroupBreakdown.map((ch) => {
                        const mins = Math.floor(ch.avgDuration / 60);
                        const secs = Math.round(ch.avgDuration % 60);
                        return (
                          <TableRow key={ch.name}>
                            <TableCell className="font-medium">
                              {ch.name}
                            </TableCell>
                            <TableCell>{formatNumber(ch.sessions)}</TableCell>
                            <TableCell>
                              {formatNumber(ch.engagedSessions)}
                            </TableCell>
                            <TableCell>
                              {Number(ch.engagementRate).toFixed(1)}%
                            </TableCell>
                            <TableCell>
                              {mins}:{secs.toString().padStart(2, "0")}
                            </TableCell>
                            <TableCell>
                              {Number(ch.eventsPerSession).toFixed(2)}
                            </TableCell>
                            <TableCell>{formatNumber(ch.users)}</TableCell>
                            {dashboardCampaignType === "ecommerce" && (
                              <>
                                <TableCell>
                                  {formatNumber(ch.purchases)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(ch.revenue)}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })}
                      {(() => {
                        const totals = channelGroupBreakdown.reduce(
                          (acc, ch) => ({
                            sessions: acc.sessions + ch.sessions,
                            engagedSessions:
                              acc.engagedSessions + ch.engagedSessions,
                            users: acc.users + ch.users,
                            purchases: acc.purchases + ch.purchases,
                            revenue: acc.revenue + ch.revenue,
                          }),
                          {
                            sessions: 0,
                            engagedSessions: 0,
                            users: 0,
                            purchases: 0,
                            revenue: 0,
                          },
                        );
                        const totalRate =
                          totals.sessions > 0
                            ? (totals.engagedSessions / totals.sessions) * 100
                            : 0;
                        return (
                          <TableRow className="bg-muted/50 font-bold border-t-2">
                            <TableCell>סה"כ</TableCell>
                            <TableCell>
                              {formatNumber(totals.sessions)}
                            </TableCell>
                            <TableCell>
                              {formatNumber(totals.engagedSessions)}
                            </TableCell>
                            <TableCell>{totalRate.toFixed(1)}%</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell>{formatNumber(totals.users)}</TableCell>
                            {dashboardCampaignType === "ecommerce" && (
                              <>
                                <TableCell>
                                  {formatNumber(totals.purchases)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(totals.revenue)}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          {dailyChartData.length > 1 && platformFilter === "all" && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Revenue vs Spend */}
              {dashboardCampaignType === "ecommerce" &&
                (showAdsCards || showAnalyticsCards) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>הכנסות מול הוצאות</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={dailyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dateLabel" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip
                            formatter={(v: number) => formatCurrency(v)}
                          />
                          <Legend />
                          {showAnalyticsCards && (
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              name="הכנסות"
                              fill="#22c55e"
                              stroke="#16a34a"
                              fillOpacity={0.3}
                            />
                          )}
                          {showAdsCards && (
                            <Bar dataKey="spend" name="הוצאה" fill="#3b82f6" />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

              {/* Sessions */}
              {showAnalyticsCards && (
                <Card>
                  <CardHeader>
                    <CardTitle>סשנים יומיים</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="sessions"
                          name="סשנים"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Spend chart for leads */}
              {dashboardCampaignType === "leads" && showAdsCards && (
                <Card>
                  <CardHeader>
                    <CardTitle>הוצאה יומית</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="spend" name="הוצאה" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Leads chart */}
              {dashboardCampaignType === "leads" && showAdsCards && (
                <Card>
                  <CardHeader>
                    <CardTitle>לידים יומיים</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="leads" name="לידים" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        Powered by {data?.dashboard?.agency_name || "Marketing Captain"}
      </p>
    </div>
  );
}
