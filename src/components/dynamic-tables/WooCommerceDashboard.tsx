import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart } from "lucide-react";
import { WooReportBody } from "@/components/WooReport/WooReportBody";
import {
  wooReportDays,
  wooReportSummary,
  wooTopProducts,
} from "@/components/WooReport/wooReportFigures";
import {
  fetchWooOrdersInRange,
  getWooDashboardDateRangeIso,
} from "@/lib/wooDashboardQueries";
import { filterWooOrdersForRevenue } from "@/lib/wooOrderRevenue";

interface Props {
  clientId: string;
  tenantId: string;
  dateFilter: string;
  customFrom?: string;
  customTo?: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
const formatNumber = (n: number) => new Intl.NumberFormat("he-IL").format(n);

export function WooCommerceDashboard({
  clientId,
  tenantId: _tenantId,
  dateFilter,
  customFrom,
  customTo,
}: Props) {
  // Find linked WooCommerce sites for the client.
  // Filter by client_id only — shared-agency WP sites may live on the agency
  // home tenant while the viewer session is on another tenant in the same agency.
  const { data: sites = [] } = useQuery({
    queryKey: ["woo-sites-for-client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_media_wordpress_sites" as any)
        .select("id, site_name, site_url, woo_last_sync_at")
        .eq("client_id", clientId)
        .eq("woocommerce_enabled", true)
        .eq("is_active", true);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!clientId,
  });

  const siteIds = sites.map((s: any) => s.id);
  const wooDateRange = getWooDashboardDateRangeIso(dateFilter, {
    customFrom,
    customTo,
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: [
      "woo-orders",
      siteIds.join(","),
      dateFilter,
      customFrom,
      customTo,
      wooDateRange.start,
      wooDateRange.end,
    ],
    queryFn: async () => {
      if (siteIds.length === 0) return [];
      return fetchWooOrdersInRange(
        siteIds,
        wooDateRange,
        "id, total, status, date_created, date_completed, date_paid, customer_email, customer_first_name, customer_last_name, line_items, order_number, currency, attribution",
      );
    },
    enabled: siteIds.length > 0,
  });

  const figures = useMemo(() => {
    const valid = filterWooOrdersForRevenue(orders, wooDateRange);
    return {
      summary: wooReportSummary(valid, orders),
      days: wooReportDays(valid),
      topProducts: wooTopProducts(valid),
    };
  }, [orders, wooDateRange]);

  if (sites.length === 0) {
    return (
      <Card className="rounded-2xl p-12 text-center shadow-elevation-1">
        <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h3 className="text-lg font-semibold mb-2">
          אין אתר WooCommerce משויך ללקוח
        </h3>
        <p className="text-muted-foreground">
          שייך אתר ללקוח דרך הגדרות WordPress
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <WooReportBody
      summary={figures.summary}
      days={figures.days}
      topProducts={figures.topProducts}
      orders={orders}
      formatCurrency={formatCurrency}
      formatNumber={formatNumber}
    />
  );
}
