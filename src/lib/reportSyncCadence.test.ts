import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  assert.equal(pulseSlots.length, 2);

  for (const job of REPORT_SYNC_SCHEDULES) {
    const slots = minutesOfDay(job.cron).sort((a, b) => a - b);
    assert.equal(slots.length, 2, job.jobname);
    for (let i = 0; i < slots.length; i++) {
      const lead = pulseSlots[i] - slots[i];
      assert.ok(
        lead >= 30 && lead <= 120,
        `${job.jobname} slot ${i} leads pulse by ${lead}m`,
      );
    }
  }
});

test("WooCommerce sync starts 15 minutes before each live campaign sync", () => {
  const campaignHours = [5, 12];
  const slots = minutesOfDay(WOO_SYNC_SCHEDULE.cron).sort((a, b) => a - b);
  assert.deepEqual(
    slots,
    campaignHours.map((hour) => hour * 60 - 15),
  );
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

  assert.equal(stagingSql, productionSql);
  assert.ok(stagingSql.includes(`'${WOO_SYNC_SCHEDULE.jobname}'`));
  assert.ok(stagingSql.includes(`'${WOO_SYNC_SCHEDULE.cron}'`));
  assert.match(stagingSql, /woocommerce-hourly-sync/);
  assert.match(stagingSql, /woo_sync_enabled = true/);
  assert.doesNotMatch(stagingSql, /Bearer /);
});
