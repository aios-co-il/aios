/** Report data syncs (cron.job.jobname → meta). See cronJobsCatalog.ts. */
import type { CronJobMeta } from "./cronJobsCatalog";

/** The syncs that call trigger-automation once new data lands. */
const AFTER_SYNC_AUTOMATIONS =
  "אחרי הסנכרון רצות האוטומציות שהוגדרו על הנתונים החדשים, והן יכולות לשלוח.";

export const SYNC_CRON_JOBS: Record<string, CronJobMeta> = {
  "sync-facebook-insights-twice-daily": {
    label: "סנכרון Facebook Insights",
    description:
      "מסנכרן ביצועי קמפיינים פעמיים ביום, לפני רענון בדיקת הדופק (07:00 ו-16:00).",
    category: "sync",
    icon: "📊",
    sends: "none",
    sendsNote: AFTER_SYNC_AUTOMATIONS,
  },
  "sync-google-ads-twice-daily": {
    label: "סנכרון Google Ads",
    description:
      "מסנכרן קמפיינים והוצאות Google Ads פעמיים ביום, לפני רענון בדיקת הדופק.",
    category: "sync",
    icon: "🎯",
    sends: "none",
    sendsNote: AFTER_SYNC_AUTOMATIONS,
  },
  "sync-google-analytics-twice-daily": {
    label: "סנכרון Google Analytics",
    description: "מושך נתוני GA לכל המחוברים פעמיים ביום.",
    category: "sync",
    icon: "📈",
    sends: "none",
  },
  "sync-woocommerce-twice-daily": {
    label: "סנכרון WooCommerce",
    description:
      "מסנכרן הזמנות, מוצרים ולקוחות פעמיים ביום, רבע שעה לפני סנכרון הקמפיינים.",
    category: "sync",
    icon: "🛍️",
    sends: "none",
  },
  "cron-sync-facebook-ecommerce-daily": {
    label: "סנכרון Facebook eCommerce",
    description:
      "מושך נתוני eCommerce מ-Facebook פעמיים ביום, לפני רענון בדיקת הדופק.",
    category: "sync",
    icon: "🛒",
    sends: "none",
  },
  "daily-ga-sync": {
    label: "סנכרון Google Analytics",
    description:
      "מושך נתוני GA לכל המחוברים פעמיים ביום, לפני רענון בדיקת הדופק.",
    category: "sync",
    icon: "📈",
    sends: "none",
  },
  "daily-google-ads-sync": {
    label: "סנכרון Google Ads",
    description:
      "מסנכרן קמפיינים והוצאות Google Ads פעמיים ביום, לפני רענון בדיקת הדופק.",
    category: "sync",
    icon: "🎯",
    sends: "none",
    sendsNote: AFTER_SYNC_AUTOMATIONS,
  },
};
