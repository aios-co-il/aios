import { useMemo } from "react";
import { Route } from "lucide-react";
import { ReportSection } from "@/components/report-ui/ReportSection";
import {
  ReportNameCell,
  ReportTable,
  ReportTd,
  ReportTh,
  ReportTr,
} from "@/components/report-ui/ReportTable";
import { aggregateOrdersByAttribution } from "@/lib/wooAttribution";

type Props = {
  orders: Parameters<typeof aggregateOrdersByAttribution>[0];
  formatCurrency: (n: number) => string;
  formatNumber: (n: number) => string;
};

/** WooCommerce orders and revenue by the traffic source each order recorded. */
export function WooAttributionSection({
  orders,
  formatCurrency,
  formatNumber,
}: Props) {
  const bySource = useMemo(
    () => aggregateOrdersByAttribution(orders),
    [orders],
  );

  if (bySource.length === 0) {
    return null;
  }

  return (
    <ReportSection title="רכישות לפי מקור הגעה" icon={Route}>
      <ReportTable
        head={
          <>
            <ReportTh>מקור</ReportTh>
            <ReportTh>הזמנות</ReportTh>
            <ReportTh>הכנסות</ReportTh>
          </>
        }
      >
        {bySource.map((row) => (
          <ReportTr key={row.label}>
            <ReportNameCell name={row.label} />
            <ReportTd>{formatNumber(row.orders)}</ReportTd>
            <ReportTd>{formatCurrency(row.revenue)}</ReportTd>
          </ReportTr>
        ))}
      </ReportTable>
      <p className="mt-3 text-xs text-muted-foreground">
        * מקור הגעה מבוסס על WooCommerce Order Attribution (UTM / referrer בשעת
        הרכישה). הזמנות ללא נתוני attribution מסווגות כ&quot;לא ידוע&quot;.
      </p>
    </ReportSection>
  );
}

export function wooAttributionLabel(order: any): string {
  return order?.attribution?.label || "לא ידוע";
}
