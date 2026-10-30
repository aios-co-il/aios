import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";
import { googleFindingsFor } from "./campaign-operational-health.ts";

const campaign = (id, status, primary_status, reasons = []) => ({
  id,
  name: `קמפיין ${id}`,
  status,
  primary_status,
  primary_status_reasons: reasons,
});

const types = (campaigns) =>
  googleFindingsFor("123", campaigns).map((f) => [f.alert_type, f.campaign_id]);

Deno.test("one paused campaign beside a live one is fine", () => {
  assertEquals(
    types([
      campaign("1", "ENABLED", "ELIGIBLE"),
      campaign("2", "PAUSED", "PAUSED"),
    ]),
    [],
  );
});

Deno.test("every campaign paused alerts once, on the account", () => {
  assertEquals(
    types([
      campaign("1", "PAUSED", "PAUSED"),
      campaign("2", "PAUSED", "NOT_ELIGIBLE"),
    ]),
    [["no_live_ads", "account:123"]],
  );
});

Deno.test("a campaign Google will not serve alerts, with its reasons", () => {
  const findings = googleFindingsFor("123", [
    campaign("1", "ENABLED", "ELIGIBLE"),
    campaign("2", "ENABLED", "NOT_ELIGIBLE", ["BILLING_SETUP"]),
  ]);
  assertEquals(
    findings.map((f) => [f.alert_type, f.campaign_id, f.severity]),
    [["campaign_stopped", "2", "critical"]],
  );
  assertEquals(findings[0].details.primary_status_reasons, ["BILLING_SETUP"]);
  assertMatch(String(findings[0].details.reason), /BILLING_SETUP/);
});

Deno.test("only stopped campaigns: both the stop and nothing live", () => {
  assertEquals(types([campaign("1", "ENABLED", "NOT_ELIGIBLE")]), [
    ["campaign_stopped", "1"],
    ["no_live_ads", "account:123"],
  ]);
});

Deno.test("pending, limited and unknown campaigns count as live", () => {
  for (const status of ["PENDING", "LIMITED", "LEARNING", null]) {
    assertEquals(types([campaign("1", "ENABLED", status)]), []);
  }
});

Deno.test(
  "a misconfigured campaign is recorded, not reported as nothing live",
  () => {
    assertEquals(
      types([
        campaign("1", "ENABLED", "MISCONFIGURED"),
        campaign("2", "ENABLED", "ELIGIBLE"),
      ]),
      [["campaign_with_issues", "1"]],
    );
  },
);

// FIXME: failing before the Deno migration (was never run in CI); fix or delete.
Deno.test.ignore(
  "two-hour cron uses lightweight operational modes for Meta and Google",
  async () => {
    const migration = await readFile(
      new URL(
        "../../migrations/20260918193000_campaign_operational_checks_every_two_hours.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const metaMonitor = await readFile(
      new URL("../fb-campaign-monitor/index.ts", import.meta.url),
      "utf8",
    );
    const googleSync = await readFile(
      new URL("../sync-google-ads-data/index.ts", import.meta.url),
      "utf8",
    );

    assertMatch(migration, /15 \*\/2 \* \* \*/);
    assertMatch(migration, /25 \*\/2 \* \* \*/);
    assertMatch(migration, /"operational_only":true/);
    assertNotMatch(metaMonitor, /\/insights\?/);
    assertMatch(metaMonitor, /account_disabled/);
    assertMatch(googleSync, /campaign\.primary_status_reasons/);
    assertMatch(googleSync, /googleFindingsFor/);
  },
);
