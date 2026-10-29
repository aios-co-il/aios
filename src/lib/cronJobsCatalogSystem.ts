/** Messaging, reminders and housekeeping jobs (cron.job.jobname → meta). See cronJobsCatalog.ts. */
import type { CronJobMeta } from "./cronJobsCatalog";

export const SYSTEM_CRON_JOBS: Record<string, CronJobMeta> = {
  "broadcast-dispatch-every-min": {
    label: "שליחת דיוורים",
    description: "כל דקה: שולח את הדיוורים שתוזמנו, בקצב מוגבל.",
    category: "messaging",
    icon: "📣",
    sends: "whatsapp_email",
  },
  "broadcast-list-sync-hourly": {
    label: "עדכון רשימות דיוור",
    description: "כל שעה: מסנכרן רשימות דיוור דינמיות מגיליונות Google.",
    category: "messaging",
    icon: "📋",
    sends: "none",
  },
  "task-notification-worker-every-minute": {
    label: "התראות משימות",
    description:
      "כל דקה: שולח התראות על משימות חדשות, תזכורות ומשימות באיחור למי שהמשימה הוקצתה לו (לא בשבת).",
    category: "reminders",
    icon: "🔔",
    sends: "whatsapp",
  },
  "check-overdue-tasks-daily": {
    label: "בדיקת משימות באיחור",
    description: "סורק משימות שעבר זמנן ושולח התראות (05:30).",
    category: "reminders",
    icon: "⏰",
    sends: "whatsapp",
    sendsNote: "דרך התראות המשימות.",
  },
  "check-meeting-reminders-daily": {
    label: "תזכורות לפגישות",
    description: "שולח תזכורות לפגישות הקרובות (08:00).",
    category: "reminders",
    icon: "📅",
    sends: "whatsapp",
  },
  "telegram-poll": {
    label: "Telegram — Polling",
    description: "מאזין להודעות חדשות מבוטים בטלגרם.",
    category: "telegram",
    icon: "✈️",
    sends: "telegram",
  },
  "cleanup-automation-executions": {
    label: "ניקוי היסטוריית אוטומציות",
    description: "כל לילה: מוחק הרצות אוטומציה בנות יותר מ-30 יום.",
    category: "system",
    icon: "🧹",
    sends: "none",
  },
  "cleanup-processed-webhook-messages": {
    label: "ניקוי הודעות webhook",
    description:
      "כל לילה: מוחק רישומי הודעות webhook שטופלו לפני יותר מ-14 יום.",
    category: "system",
    icon: "🧹",
    sends: "none",
  },
  "meta-data-deletion-requests-retention": {
    label: "שמירת בקשות מחיקת מידע",
    description:
      "כל לילה: מוחק רישומי בקשות מחיקת מידע של Meta בני יותר מ-12 חודשים.",
    category: "system",
    icon: "🗑️",
    sends: "none",
  },
};
