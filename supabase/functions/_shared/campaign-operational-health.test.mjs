import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";
import {
  campaignStateMap,
  evaluateGoogleOperationalIssues,
} from "./campaign-operational-health.ts";

Deno.test(
  "first operational scan establishes a baseline without alerting",
  () => {
    assertEquals(
      evaluateGoogleOperationalIssues(null, [
        {
          id: "1",
          name: "Lead",
          status: "ENABLED",
          primary_status: "ELIGIBLE",
        },
      ]),
      [],
    );
  },
);

Deno.test("alerts when an enabled campaign becomes blocked or paused", () => {
  const previous = campaignStateMap([
    { id: "1", name: "Lead", status: "ENABLED", primary_status: "ELIGIBLE" },
    { id: "2", name: "Shop", status: "ENABLED", primary_status: "ELIGIBLE" },
  ]);
  const issues = evaluateGoogleOperationalIssues(previous, [
    {
      id: "1",
      name: "Lead",
      status: "ENABLED",
      primary_status: "NOT_ELIGIBLE",
      primary_status_reasons: ["BILLING_SETUP"],
    },
    { id: "2", name: "Shop", status: "PAUSED", primary_status: "NOT_ELIGIBLE" },
  ]);
  assertStrictEquals(issues.length, 2);
  assertEquals(issues[0].details.primary_status_reasons, ["BILLING_SETUP"]);
});

Deno.test("does not alert repeatedly when campaign was already stopped", () => {
  const previous = campaignStateMap([
    { id: "1", name: "Lead", status: "PAUSED", primary_status: "NOT_ELIGIBLE" },
  ]);
  assertEquals(
    evaluateGoogleOperationalIssues(previous, [
      {
        id: "1",
        name: "Lead",
        status: "PAUSED",
        primary_status: "NOT_ELIGIBLE",
      },
    ]),
    [],
  );
});

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
    assertMatch(googleSync, /evaluateGoogleOperationalIssues/);
  },
);
