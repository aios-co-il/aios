import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  PULSE_REFRESH_CRONS,
  REPORT_SYNC_SCHEDULES,
  WOO_SYNC_SCHEDULE,
} from "./cronJobsCatalog.ts";

function minutesOfDay(cron: string): number[] {
  const [minute, hour] = cron.split(/\s+/);
  const minutes = minute.split(",").map(Number);
  const hours = hour.split(",").map(Number);
  return hours.flatMap((h) => minutes.map((m) => h * 60 + m));
}

test("report sync runs twice a day and finishes before each pulse refresh", () => {
  const pulseSlots = PULSE_REFRESH_CRONS.flatMap(minutesOfDay).sort(
    (a, b) => a - b,
  );
  expect(pulseSlots.length).toBe(2);

  for (const job of REPORT_SYNC_SCHEDULES) {
    const slots = minutesOfDay(job.cron).sort((a, b) => a - b);
    expect(slots.length, job.jobname).toBe(2);
    for (let i = 0; i < slots.length; i++) {
      const lead = pulseSlots[i] - slots[i];
      expect(
        lead >= 30 && lead <= 120,
        `${job.jobname} slot ${i} leads pulse by ${lead}m`,
      ).toBeTruthy();
    }
  }
});

test("WooCommerce sync starts 15 minutes before each live campaign sync", () => {
  const campaignHours = [5, 12];
  const slots = minutesOfDay(WOO_SYNC_SCHEDULE.cron).sort((a, b) => a - b);
  expect(slots).toStrictEqual(campaignHours.map((hour) => hour * 60 - 15));
});

test("WooCommerce schedule preserves the working cron command", () => {
  const stagingSql = readFileSync(
    "supabase/ops/apply_woocommerce_campaign_cadence_staging.sql",
    "utf8",
  );
  const productionSql = readFileSync(
    "supabase/ops/apply_woocommerce_campaign_cadence_production.sql",
    "utf8",
  );

  expect(stagingSql).toBe(productionSql);
  expect(stagingSql.includes(`'${WOO_SYNC_SCHEDULE.jobname}'`)).toBeTruthy();
  expect(stagingSql.includes(`'${WOO_SYNC_SCHEDULE.cron}'`)).toBeTruthy();
  expect(stagingSql).toMatch(/woocommerce-hourly-sync/);
  expect(stagingSql).toMatch(/woo_sync_enabled = true/);
  expect(stagingSql).not.toMatch(/Bearer /);
});
