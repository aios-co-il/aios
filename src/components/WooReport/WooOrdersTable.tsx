import { Receipt } from "lucide-react";
import { wooAttributionLabel } from "@/components/dynamic-tables/WooAttributionSection";
import { ReportSection } from "@/components/report-ui/ReportSection";
import {
  ReportTable,
  ReportTd,
  ReportTh,
  ReportTr,
} from "@/components/report-ui/ReportTable";
import { StatusChip, type StatusTone } from "@/components/report-ui/StatusChip";
import type { WooReportFormatters, WooReportOrder } from "./wooReportTypes";

/** How many of the period's orders the table lists. */
const SHOWN_ORDERS = 50;

type Props = WooReportFormatters & {
  orders: Array<WooReportOrder>;
  /** Every order in the period, counted in the title. */
  totalOrders: number;
};

/** The period's latest orders: number, date, customer, source, status and amount. */
export function WooOrdersTable({ orders, totalOrders, formatCurrency }: Props) {
  return (
    <ReportSection title={`הזמנות אחרונות (${totalOrders})`} icon={Receipt}>
      <ReportTable
        head={["הזמנה", "תאריך", "לקוח", "מקור", "סטטוס", "סכום"].map(
          (label) => (
            <ReportTh key={label}>{label}</ReportTh>
          ),
        )}
      >
        {orders.slice(0, SHOWN_ORDERS).map((order) => (
          <ReportTr key={order.id}>
            <ReportTd>#{order.order_number}</ReportTd>
            <ReportTd>
              {new Date(order.date_created).toLocaleDateString("he-IL")}
            </ReportTd>
            <ReportTd>{customerOf(order)}</ReportTd>
            <ReportTd className="text-muted-foreground">
              {wooAttributionLabel(order)}
            </ReportTd>
            <ReportTd>
              <StatusChip tone={statusTone(order.status)}>
                {order.status}
              </StatusChip>
            </ReportTd>
            <ReportTd className="font-medium">
              {formatCurrency(Number(order.total))}
            </ReportTd>
          </ReportTr>
        ))}
      </ReportTable>
    </ReportSection>
  );
}

/** The customer's name, or their email when the order has no name. */
function customerOf(order: WooReportOrder): string {
  return (
    [order.customer_first_name, order.customer_last_name]
      .filter(Boolean)
      .join(" ") ||
    order.customer_email ||
    "—"
  );
}

/** Paid orders in the accent, lost ones in red, the rest as drafts. */
function statusTone(status: string): StatusTone {
  if (["completed", "processing"].includes(status)) {
    return "active";
  }
  return ["cancelled", "refunded", "failed"].includes(status)
    ? "danger"
    : "draft";
}
