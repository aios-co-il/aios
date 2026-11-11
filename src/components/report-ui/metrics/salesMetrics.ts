import {
  Banknote,
  BarChart3,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Store,
  TrendingUp,
} from "lucide-react";
import {
  costPerPurchase,
  purchaseValueUnreported,
} from "@/lib/dashboardCombinedFigures";
import type { ReportMetric, ReportMetricKey } from "./reportMetricTypes";
import {
  analyticsCarts,
  isWoo,
  PLATFORMS_SOURCE,
  roasOf,
  salesOf,
  salesSource,
} from "./salesFigures";

type SalesKey =
  | "purchases"
  | "costPerPurchase"
  | "revenue"
  | "roas"
  | "addToCart"
  | "wooRevenue"
  | "wooOrders"
  | "gaRevenue"
  | "adsRevenue";

const SALES_SCOPES = ["all", "ecommerce"] as const;

/** Sales: the store's figures where the dashboard has one, else the campaigns'. */
export const SALES_METRICS: Record<SalesKey, ReportMetric> = {
  revenue: {
    key: "revenue",
    label: "הכנסות",
    icon: Banknote,
    format: "currency",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    // Purchases without a value (a free course) are no revenue of 0.
    compute: (f) =>
      purchaseValueUnreported(salesOf(f)) ? null : salesOf(f).revenue,
    whyEmpty: () => "הרכישות ללא ערך",
    source: salesSource,
  },
  roas: {
    key: "roas",
    label: "ROAS",
    icon: TrendingUp,
    format: "ratio",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: roasOf,
    whyEmpty: (f) =>
      purchaseValueUnreported(salesOf(f))
        ? "הרכישות ללא ערך · נמדד בעלות לרכישה"
        : "אין הוצאה בתקופה",
    source: (f) => (f.store ? `${f.store.source} מול ההוצאה` : null),
  },
  purchases: {
    key: "purchases",
    label: "רכישות",
    icon: ShoppingBag,
    format: "number",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: (f) => salesOf(f).purchases,
    source: salesSource,
  },
  costPerPurchase: {
    key: "costPerPurchase",
    label: "עלות לרכישה",
    icon: Receipt,
    format: "currency",
    goodWhen: "down",
    scopes: SALES_SCOPES,
    compute: (f) => costPerPurchase(salesOf(f)),
    whyEmpty: () => "אין רכישות בתקופה",
    source: salesSource,
  },
  addToCart: {
    key: "addToCart",
    label: "הוספה לעגלה (ATC)",
    icon: ShoppingCart,
    format: "number",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: (f) => (analyticsCarts(f) ? analyticsCarts(f) : f.addToCart),
    available: (f) => analyticsCarts(f) > 0 || f.addToCartTracked,
    source: (f) => (analyticsCarts(f) ? "Analytics" : PLATFORMS_SOURCE),
  },
  wooRevenue: {
    key: "wooRevenue",
    label: "הכנסות WooCommerce",
    icon: Store,
    format: "currency",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: (f) => (isWoo(f) ? (f.store?.revenue ?? null) : null),
    available: isWoo,
  },
  wooOrders: {
    key: "wooOrders",
    label: "הזמנות WooCommerce",
    icon: Store,
    format: "number",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: (f) => (isWoo(f) ? (f.store?.purchases ?? null) : null),
    available: isWoo,
  },
  gaRevenue: {
    key: "gaRevenue",
    label: "הכנסות לפי Analytics",
    icon: BarChart3,
    format: "currency",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: (f) => f.analytics?.revenue ?? null,
    // Only beside WooCommerce: without it Analytics already is the revenue.
    available: (f) => isWoo(f) && (f.analytics?.revenue ?? 0) > 0,
    source: () => "להשוואה · GA מדווח",
  },
  adsRevenue: {
    key: "adsRevenue",
    label: "הכנסות לפי הפלטפורמות",
    icon: Banknote,
    format: "currency",
    goodWhen: "up",
    scopes: SALES_SCOPES,
    compute: (f) => (purchaseValueUnreported(f) ? null : f.revenue),
    whyEmpty: () => "הפלטפורמות דיווחו רכישות ללא ערך",
    // Without a store the revenue already is the platforms' figure.
    available: (f) => f.store !== null,
    source: () => "ערך ההמרות שדיווחו Meta ו-Google",
  },
} satisfies Partial<Record<ReportMetricKey, ReportMetric>>;
