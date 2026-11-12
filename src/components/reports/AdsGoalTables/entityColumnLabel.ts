import type { AdsEntityLevel } from "@/lib/adsEntityLevel";

/** The heading of a goal table's name column at the report's entity level. */
export function entityColumnLabel(level: AdsEntityLevel): string {
  if (level === "ad") {
    return "מודעה";
  }
  return level === "adset" ? "קבוצת מודעות" : "קמפיין";
}
