import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  CRITICAL_ALERT_KINDS,
  criticalAlertKind,
  isAlertHeldForShabbat,
} from "./critical-alerts.ts";

const FRIDAY_2359 = new Date("2026-10-30T21:59:00Z"); // IST, UTC+2
const SATURDAY_0000 = new Date("2026-10-30T22:00:00Z");
const SATURDAY_2359 = new Date("2026-10-31T21:59:00Z");
const SUNDAY_0000 = new Date("2026-10-31T22:00:00Z");

Deno.test("criticalAlertKind", async (t) => {
  await t.step(
    "only ad-account stops, lost connections and undelivered leads are critical",
    () => {
      assertEquals(
        [...CRITICAL_ALERT_KINDS],
        ["ad_account_stopped", "connection_lost", "lead_alert_failure"],
      );
      assertStrictEquals(
        criticalAlertKind("account_disabled"),
        "ad_account_stopped",
      );
      assertStrictEquals(
        criticalAlertKind("ad_account_blocked"),
        "ad_account_stopped",
      );
      assertStrictEquals(
        criticalAlertKind("integration_disconnected"),
        "connection_lost",
      );
      assertStrictEquals(
        criticalAlertKind("connection_lost"),
        "connection_lost",
      );
      assertStrictEquals(
        criticalAlertKind("lead_alert_failure"),
        "lead_alert_failure",
      );
      for (const kind of [
        "campaign_stopped",
        "ad_disapproved",
        "campaign_with_issues",
        "no_contact",
        "cpl_spike",
        "campaign_exception",
        "",
        null,
      ]) {
        assertStrictEquals(criticalAlertKind(kind), null, String(kind));
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
