import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  isAlertHeldForShabbat,
  isShabbatCriticalAlert,
} from "./critical-alerts.ts";

const FRIDAY_2359 = new Date("2026-10-30T21:59:00Z"); // IST, UTC+2
const SATURDAY_0000 = new Date("2026-10-30T22:00:00Z");
const SATURDAY_2359 = new Date("2026-10-31T21:59:00Z");
const SUNDAY_0000 = new Date("2026-10-31T22:00:00Z");

Deno.test("isShabbatCriticalAlert", async (t) => {
  await t.step(
    "only ad-account stops, lost connections and undelivered leads are critical",
    () => {
      for (const kind of [
        "ad_account_stopped",
        "account_disabled",
        "ad_account_blocked",
        "integration_disconnected",
        "connection_lost",
        "lead_alert_failure",
        " Account_Disabled ",
      ]) {
        assertStrictEquals(isShabbatCriticalAlert(kind), true, kind);
      }
      for (const kind of [
        "campaign_stopped",
        "ad_disapproved",
        "campaign_with_issues",
        "no_contact",
        "cpl_spike",
        "campaign_exception",
        "constructor",
        "",
        null,
      ]) {
        assertStrictEquals(isShabbatCriticalAlert(kind), false, String(kind));
      }
    },
  );
});

Deno.test("isAlertHeldForShabbat", async (t) => {
  await t.step(
    "Saturday holds non-critical alerts and lets critical ones through",
    () => {
      assertStrictEquals(
        isAlertHeldForShabbat("ad_disapproved", SATURDAY_0000),
        true,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("campaign_stopped", SATURDAY_2359),
        true,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("no_contact", SATURDAY_0000),
        true,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("account_disabled", SATURDAY_0000),
        false,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("connection_lost", SATURDAY_0000),
        false,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("lead_alert_failure", SATURDAY_0000),
        false,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("ad_disapproved", FRIDAY_2359),
        false,
      );
      assertStrictEquals(
        isAlertHeldForShabbat("ad_disapproved", SUNDAY_0000),
        false,
      );
    },
  );
});
