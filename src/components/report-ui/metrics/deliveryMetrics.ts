import {
  Activity,
  Coins,
  Eye,
  MousePointerClick,
  Percent,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import type { ReportMetric, ReportMetricKey } from "./reportMetricTypes";

type DeliveryKey =
  | "spend"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "leads"
  | "cpl"
  | "sessions";

/** Delivery, spend, leads and site traffic. */
export const DELIVERY_METRICS: Record<DeliveryKey, ReportMetric> = {
  spend: {
    key: "spend",
    label: "הוצאה",
    icon: Wallet,
    format: "currency",
    goodWhen: "either",
    scopes: ["all", "ecommerce", "leads", "traffic"],
    compute: (f) => f.spend,
  },
  impressions: {
    key: "impressions",
    label: "חשיפות",
    icon: Eye,
    format: "number",
    goodWhen: "either",
    scopes: ["all", "traffic"],
    compute: (f) => f.impressions,
  },
  clicks: {
    key: "clicks",
    label: "קליקים",
    icon: MousePointerClick,
    format: "number",
    goodWhen: "up",
    scopes: ["all", "traffic"],
    compute: (f) => f.clicks,
  },
  ctr: {
    key: "ctr",
    label: "שיעור הקלקה (CTR)",
    icon: Percent,
    format: "percent",
    goodWhen: "up",
    scopes: ["all", "traffic"],
    compute: (f) => ratio(f.clicks, f.impressions),
    whyEmpty: () => "אין חשיפות",
  },
  cpc: {
    key: "cpc",
    label: "עלות לקליק (CPC)",
    icon: Coins,
    format: "unitCost",
    goodWhen: "down",
    scopes: ["all", "traffic"],
    compute: (f) => ratio(f.spend, f.clicks),
    whyEmpty: () => "אין קליקים",
  },
  cpm: {
    key: "cpm",
    label: "עלות לאלף חשיפות (CPM)",
    icon: Coins,
    format: "unitCost",
    goodWhen: "down",
    scopes: ["all", "traffic"],
    compute: (f) => {
      const perImpression = ratio(f.spend, f.impressions);
      return perImpression === null ? null : perImpression * 1000;
    },
    whyEmpty: () => "אין חשיפות",
  },
  leads: {
    key: "leads",
    label: "לידים",
    icon: Users,
    format: "number",
    goodWhen: "up",
    scopes: ["all", "leads"],
    compute: (f) => f.leads,
  },
  cpl: {
    key: "cpl",
    label: "עלות לליד (CPL)",
    icon: Tag,
    format: "currency",
    goodWhen: "down",
    scopes: ["all", "leads"],
    compute: (f) => ratio(f.spend, f.leads),
    whyEmpty: () => "אין לידים בתקופה",
  },
  sessions: {
    key: "sessions",
    label: "סשנים (Analytics)",
    icon: Activity,
    format: "number",
    goodWhen: "up",
    scopes: ["all", "traffic"],
    compute: (f) => f.analytics?.sessions ?? null,
    available: (f) => f.analytics !== null,
  },
} satisfies Partial<Record<ReportMetricKey, ReportMetric>>;

/** a / b, or null when b is not positive. */
export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}
