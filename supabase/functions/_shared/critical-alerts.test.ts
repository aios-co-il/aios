import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isJerusalemShabbat,
  jerusalemLocalTimeToUtc,
  jerusalemShabbatHoldUntil,
} from "./calendarTimeZone.ts";
import {
  CAMPAIGN_ALERT_SHABBAT_HOLD,
  CRITICAL_ALERT_KINDS,
  criticalAlertKind,
  isAlertHeldForShabbat,
  shouldReleaseHeldCampaignAlert,
} from "./critical-alerts.ts";

const FRIDAY_2359 = new Date("2026-10-30T21:59:00Z"); // IST, UTC+2
const SATURDAY_0000 = new Date("2026-10-30T22:00:00Z");
const SATURDAY_2359 = new Date("2026-10-31T21:59:00Z");
const SUNDAY_0000 = new Date("2026-10-31T22:00:00Z");

Deno.test(
  "Shabbat is the whole Saturday in Israel time, not the UTC day",
  () => {
    assertStrictEquals(isJerusalemShabbat(FRIDAY_2359), false);
    assertStrictEquals(isJerusalemShabbat(SATURDAY_0000), true); // still Friday in UTC
    assertStrictEquals(isJerusalemShabbat(SATURDAY_2359), true);
    assertStrictEquals(isJerusalemShabbat(SUNDAY_0000), false); // still Saturday in UTC
    // Summer time (UTC+3): Saturday 00:30 Israel is Friday 21:30 UTC.
    assertStrictEquals(
      isJerusalemShabbat(new Date("2026-10-23T21:30:00Z")),
      true,
    );
    assertStrictEquals(
      isJerusalemShabbat(new Date("2026-10-24T21:30:00Z")),
      false,
    );
  },
);

Deno.test("Israel wall-clock conversion is DST-safe", () => {
  assertStrictEquals(
    jerusalemLocalTimeToUtc("2026-10-24", 8, 30).toISOString(),
    "2026-10-24T05:30:00.000Z",
  );
  assertStrictEquals(
    jerusalemLocalTimeToUtc("2026-10-25", 8, 30).toISOString(),
    "2026-10-25T06:30:00.000Z",
  );
  assertStrictEquals(
    jerusalemLocalTimeToUtc("2026-10-25", 0, 0).toISOString(),
    "2026-10-24T21:00:00.000Z",
  );
});

Deno.test(
  "hold window: Saturday-only for alerts, until Sunday 08:30 by default",
  () => {
    const midnight = { hour: 0, minute: 0 };
    assertStrictEquals(jerusalemShabbatHoldUntil(FRIDAY_2359, midnight), null);
    assertStrictEquals(
      jerusalemShabbatHoldUntil(SATURDAY_0000, midnight)?.toISOString(),
      SUNDAY_0000.toISOString(),
    );
    assertStrictEquals(jerusalemShabbatHoldUntil(SUNDAY_0000, midnight), null);
    assertStrictEquals(
      jerusalemShabbatHoldUntil(SUNDAY_0000)?.toISOString(),
      "2026-11-01T06:30:00.000Z",
    );
  },
);

Deno.test(
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
    assertStrictEquals(criticalAlertKind("connection_lost"), "connection_lost");
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

Deno.test(
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

Deno.test(
  "a held campaign alert is released once after Shabbat; legacy rows never",
  () => {
    const held = {
      notified_at: null,
      details: { whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD },
    };
    assertStrictEquals(
      shouldReleaseHeldCampaignAlert(held, SATURDAY_2359),
      false,
    );
    assertStrictEquals(shouldReleaseHeldCampaignAlert(held, SUNDAY_0000), true);
    assertStrictEquals(
      shouldReleaseHeldCampaignAlert(
        { ...held, notified_at: SUNDAY_0000.toISOString() },
        SUNDAY_0000,
      ),
      false,
    );
    // An old row that simply never reached anyone must not be replayed.
    assertStrictEquals(
      shouldReleaseHeldCampaignAlert(
        { notified_at: null, details: {} },
        SUNDAY_0000,
      ),
      false,
    );
    assertStrictEquals(
      shouldReleaseHeldCampaignAlert(null, SUNDAY_0000),
      false,
    );
  },
);
