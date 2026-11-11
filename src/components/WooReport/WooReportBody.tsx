import { format, parseISO } from "date-fns";
import {
  Ban,
  Banknote,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { WooAttributionSection } from "@/components/dynamic-tables/WooAttributionSection";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { ReportSection } from "@/components/report-ui/ReportSection";
import { ReportTrendChart } from "@/components/report-ui/ReportTrendChart";
import {
  ReportNameCell,
  ReportTable,
  ReportTd,
  ReportTh,
  ReportTr,
} from "@/components/report-ui/ReportTable";
import { WooOrdersTable } from "./WooOrdersTable";
import type {
  WooReportDay,
  WooReportFormatters,
  WooReportOrder,
  WooReportProduct,
  WooReportSummary,
} from "./wooReportTypes";

type Props = WooReportFormatters & {
  summary: WooReportSummary;
  days: Array<WooReportDay>;
  topProducts: Array<WooReportProduct>;
  orders: Array<WooReportOrder>;
};

/**
 * The WooCommerce tab of the internal and shared dashboards in the report
 * design: headline figures, revenue and orders per day, top products, orders
 * by traffic source and the latest orders.
 */
export function WooReportBody({
  summary,
  days,
  topProducts,
  orders,
  ...formats
}: Props) {
  const { formatCurrency, formatNumber } = formats;
  const chartDays = days.map((day) => ({
    ...day,
    day: format(parseISO(day.date), "dd/MM"),
  }));
  return (
    <div className="space-y-4">
      <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <ReportKpiCard
          icon={Banknote}
          label="הכנסות (WooCommerce)"
          value={formatCurrency(summary.totalRevenue)}
        />
        <ReportKpiCard
          icon={ShoppingCart}
          label="הזמנות"
          value={formatNumber(summary.orderCount)}
        />
        <ReportKpiCard
          icon={Package}
          label="ערך הזמנה ממוצע"
          value={formatCurrency(summary.aov)}
        />
        <ReportKpiCard
          icon={Users}
          label="לקוחות ייחודיים"
          value={formatNumber(summary.uniqueCustomers)}
        />
        <ReportKpiCard
          icon={Ban}
          label="בוטלו / הוחזרו"
          value={formatNumber(summary.cancelledCount)}
        />
      </div>

      {chartDays.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <ReportTrendChart
            title="הכנסות יומיות"
            icon={TrendingUp}
            data={chartDays}
            xKey="day"
            valueKey="revenue"
            valueName="הכנסות"
            format={formatCurrency}
          />
          <ReportTrendChart
            title="הזמנות יומיות"
            icon={ShoppingBag}
            data={chartDays}
            xKey="day"
            valueKey="orders"
            valueName="הזמנות"
            format={formatNumber}
          />
        </div>
      )}

      {topProducts.length > 0 && (
        <ReportSection title="מוצרים מובילים" icon={Package}>
          <ReportTable
            head={
              <>
                <ReportTh>מוצר</ReportTh>
                <ReportTh>כמות</ReportTh>
                <ReportTh>הכנסות</ReportTh>
              </>
            }
          >
            {topProducts.map((product) => (
              <ReportTr key={product.name}>
                <ReportNameCell name={product.name} />
                <ReportTd>{formatNumber(product.quantity)}</ReportTd>
                <ReportTd>{formatCurrency(product.revenue)}</ReportTd>
              </ReportTr>
            ))}
          </ReportTable>
        </ReportSection>
      )}

      <WooAttributionSection orders={orders} {...formats} />

      <WooOrdersTable
        orders={orders}
        totalOrders={summary.totalOrders}
        {...formats}
      />
    </div>
  );
}
