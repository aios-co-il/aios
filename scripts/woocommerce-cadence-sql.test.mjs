import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WOO_SYNC_SCHEDULE } from "../src/lib/cronJobsCatalog.ts";

const read = (name) =>
  readFileSync(new URL(`../supabase/ops/${name}`, import.meta.url), "utf8");

test("WooCommerce schedule preserves the working cron command", () => {
  const stagingSql = read("apply_woocommerce_campaign_cadence_staging.sql");
  const productionSql = read(
    "apply_woocommerce_campaign_cadence_production.sql",
  );

  expect(stagingSql).toBe(productionSql);
  expect(stagingSql.includes(`'${WOO_SYNC_SCHEDULE.jobname}'`)).toBeTruthy();
  expect(stagingSql.includes(`'${WOO_SYNC_SCHEDULE.cron}'`)).toBeTruthy();
  expect(stagingSql).toMatch(/woocommerce-hourly-sync/);
  expect(stagingSql).toMatch(/woo_sync_enabled = true/);
  expect(stagingSql).not.toMatch(/Bearer /);
});
