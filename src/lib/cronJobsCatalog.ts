// Friendly catalog for system cron jobs.
// Keys are the cron.job.jobname values.

import { CARMEN_CRON_JOBS } from "./cronJobsCatalogCarmen";
import { SYNC_CRON_JOBS } from "./cronJobsCatalogSync";
import { SYSTEM_CRON_JOBS } from "./cronJobsCatalogSystem";

export type CronCategory =
  "carmen" | "sync" | "reminders" | "messaging" | "telegram" | "system";

/**
 * What a job sends to people. "dashboard" writes only what the app shows;
 * "none" sends and shows nothing new. `sendsNote` explains an indirect send.
 */
export type CronSends =
  "whatsapp" | "email" | "whatsapp_email" | "telegram" | "dashboard" | "none";

export interface CronJobMeta {
  label: string;
  description: string;
  category: CronCategory;
  icon: string;
  sends: CronSends;
  sendsNote?: string;
}

/** Short Hebrew label of what a job sends, for a badge. */
export const CRON_SENDS_LABEL: Record<CronSends, string> = {
  whatsapp: "שולח וואטסאפ",
  email: "שולח מייל",
  whatsapp_email: "שולח וואטסאפ ומייל",
  telegram: "עונה בטלגרם",
  dashboard: "דשבורד בלבד",
  none: "לא שולח",
};

export const CRON_JOB_CATALOG: Record<string, CronJobMeta> = {
  ...CARMEN_CRON_JOBS,
  ...SYNC_CRON_JOBS,
  ...SYSTEM_CRON_JOBS,
};

/**
 * Report syncs that feed בדיקת הדופק. Times are UTC, twice a day, and each
 * slot finishes before the pulse refresh at 04:00 and 13:00 UTC.
 */
export const REPORT_SYNC_SCHEDULES = [
  { jobname: "sync-woocommerce-twice-daily", cron: "30 2,11 * * *" },
  { jobname: "daily-google-ads-sync", cron: "40 2,11 * * *" },
  { jobname: "sync-facebook-insights-twice-daily", cron: "45 2,11 * * *" },
  { jobname: "cron-sync-facebook-ecommerce-daily", cron: "50 2,11 * * *" },
  { jobname: "daily-ga-sync", cron: "55 2,11 * * *" },
] as const;

export const PULSE_REFRESH_CRONS = ["0 4 * * *", "0 13 * * *"] as const;

/** Live campaign syncs run at 05:00 and 12:00 UTC. WooCommerce starts 15 minutes earlier. */
export const WOO_SYNC_SCHEDULE = {
  jobname: "sync-woocommerce-twice-daily",
  cron: "45 4,11 * * *",
} as const;

export function getCronMeta(jobname: string): CronJobMeta {
  return (
    CRON_JOB_CATALOG[jobname] || {
      label: jobname,
      description: "ג'וב מערכת ללא תיעוד.",
      category: "system",
      icon: "⚙️",
      sends: "none",
    }
  );
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function describeCronExpression(expr: string): string {
  if (!expr) return "—";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Cron: ${expr}`;
  const [minute, hour, dom, month, dow] = parts;

  const pad = (s: string) => s.padStart(2, "0");
  const timeStr = (h: string, m: string) =>
    `${pad(h)}:${pad(m === "*" ? "00" : m)}`;

  // every minute
  if (expr === "* * * * *") return "כל דקה";
  // every N minutes
  if (hour === "*" && minute.startsWith("*/"))
    return `כל ${minute.slice(2)} דקות`;
  // every hour at minute X
  if (hour === "*" && /^\d+$/.test(minute)) return `כל שעה ב-:${pad(minute)}`;
  // every N hours
  if (hour.startsWith("*/") && /^\d+$/.test(minute))
    return `כל ${hour.slice(2)} שעות`;

  if (
    dom === "*" &&
    month === "*" &&
    dow === "*" &&
    /^\d+$/.test(hour) &&
    /^\d+$/.test(minute)
  )
    return `כל יום ב-${timeStr(hour, minute)}`;

  if (dom === "*" && month === "*" && /^\d+$/.test(dow) && /^\d+$/.test(hour))
    return `כל יום ${HEBREW_DAYS[parseInt(dow) % 7]} ב-${timeStr(hour, minute)}`;

  // multiple hours: "0 5,14 * * *"
  if (
    dom === "*" &&
    month === "*" &&
    dow === "*" &&
    hour.includes(",") &&
    /^\d+$/.test(minute)
  ) {
    const hours = hour
      .split(",")
      .map((h) => `${pad(h)}:${pad(minute)}`)
      .join(", ");
    return `כל יום ב-${hours}`;
  }

  return `Cron: ${expr}`;
}
