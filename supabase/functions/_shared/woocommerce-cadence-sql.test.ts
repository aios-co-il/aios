import { assert, assertEquals } from "jsr:@std/assert@1";
import { WOO_SYNC_SCHEDULE } from "../../../src/lib/cronJobsCatalog.ts";

const read = (name: string) =>
  Deno.readTextFile(new URL(`../../ops/${name}`, import.meta.url));

Deno.test(
  "WooCommerce cadence installers match the catalog and carry no secret",
  async () => {
    const staging = await read(
      "apply_woocommerce_campaign_cadence_staging.sql",
    );
    const production = await read(
      "apply_woocommerce_campaign_cadence_production.sql",
    );

    assertEquals(staging, production);
    assert(staging.includes(`'${WOO_SYNC_SCHEDULE.jobname}'`));
    assert(staging.includes(`'${WOO_SYNC_SCHEDULE.cron}'`));
    assert(staging.includes("woo_sync_enabled = true"));
    assert(!staging.includes("Bearer "));
  },
);
