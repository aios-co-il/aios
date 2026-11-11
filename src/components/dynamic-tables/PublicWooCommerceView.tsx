import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";
import { WooReportBody } from "@/components/WooReport/WooReportBody";
import {
  wooReportDays,
  wooReportSummary,
  wooTopProducts,
} from "@/components/WooReport/wooReportFigures";
import { filterWooOrdersForRevenue } from "@/lib/wooOrderRevenue";

interface PublicWooCommerceViewProps {
  sites: any[];
  orders: any[];
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
const formatNumber = (n: number) => new Intl.NumberFormat("he-IL").format(n);

export function PublicWooCommerceView({
  sites,
  orders,
}: PublicWooCommerceViewProps) {
  const figures = useMemo(() => {
    const valid = filterWooOrdersForRevenue(orders, null);
    return {
      summary: wooReportSummary(valid, orders),
      days: wooReportDays(valid),
      // The revenue statuses are the ones the top products always counted.
      topProducts: wooTopProducts(valid),
    };
  }, [orders]);

  if (!sites || sites.length === 0) {
    return (
      <Card className="rounded-2xl p-12 text-center shadow-elevation-1">
        <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h3 className="text-lg font-semibold mb-2">
          אין אתר WooCommerce משויך ללקוח
        </h3>
      </Card>
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
