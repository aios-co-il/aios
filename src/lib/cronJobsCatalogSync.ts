/** Report data syncs (cron.job.jobname → meta). See cronJobsCatalog.ts. */
import type { CronJobMeta } from "./cronJobsCatalog";

/** The syncs that call trigger-automation once new data lands. */
const AFTER_SYNC_AUTOMATIONS =
  "אחרי הסנכרון רצות האוטומציות שהוגדרו על הנתונים החדשים, והן יכולות לשלוח.";

export const SYNC_CRON_JOBS: Record<string, CronJobMeta> = {
  "sync-facebook-insights-twice-daily": {
    label: "סנכרון Facebook Insights",
    description:
      "מסנכרן ביצועי קמפיינים 5 פעמים ביום, כל 3 שעות בין 07:00 ל-19:00 (בקיץ 08:00–20:00), ומרענן אחריו את בדיקת הדופק.",
    category: "sync",
    icon: "📊",
    sends: "none",
    sendsNote: AFTER_SYNC_AUTOMATIONS,
  },
  "sync-google-ads-twice-daily": {
    label: "סנכרון Google Ads",
    description:
      "מסנכרן קמפיינים והוצאות Google Ads 5 פעמים ביום, כל 3 שעות בין 07:10 ל-19:10 (בקיץ 08:10–20:10), ומרענן אחריו את בדיקת הדופק.",
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
      "מסנכרן הזמנות, מוצרים ולקוחות פעמיים ביום; ריצת הבוקר רבע שעה לפני סנכרון הקמפיינים הראשון.",
    category: "sync",
    icon: "🛍️",
    sends: "none",
  },
  "cron-sync-facebook-ecommerce-daily": {
    label: "סנכרון Facebook eCommerce",
    description:
      "מושך נתוני eCommerce מ-Facebook 5 פעמים ביום, כל 3 שעות בין 07:05 ל-19:05 (בקיץ 08:05–20:05), ומרענן אחריו את בדיקת הדופק.",
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
