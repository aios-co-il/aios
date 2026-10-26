import assert from "node:assert/strict";
import test from "node:test";
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

test("Shabbat is the whole Saturday in Israel time, not the UTC day", () => {
  assert.equal(isJerusalemShabbat(FRIDAY_2359), false);
  assert.equal(isJerusalemShabbat(SATURDAY_0000), true); // still Friday in UTC
  assert.equal(isJerusalemShabbat(SATURDAY_2359), true);
  assert.equal(isJerusalemShabbat(SUNDAY_0000), false); // still Saturday in UTC
  // Summer time (UTC+3): Saturday 00:30 Israel is Friday 21:30 UTC.
  assert.equal(isJerusalemShabbat(new Date("2026-10-23T21:30:00Z")), true);
  assert.equal(isJerusalemShabbat(new Date("2026-10-24T21:30:00Z")), false);
});

test("Israel wall-clock conversion is DST-safe", () => {
  assert.equal(
    jerusalemLocalTimeToUtc("2026-10-24", 8, 30).toISOString(),
    "2026-10-24T05:30:00.000Z",
  );
  assert.equal(
    jerusalemLocalTimeToUtc("2026-10-25", 8, 30).toISOString(),
    "2026-10-25T06:30:00.000Z",
  );
  assert.equal(
    jerusalemLocalTimeToUtc("2026-10-25", 0, 0).toISOString(),
    "2026-10-24T21:00:00.000Z",
  );
});

test("hold window: Saturday-only for alerts, until Sunday 08:30 by default", () => {
  const midnight = { hour: 0, minute: 0 };
  assert.equal(jerusalemShabbatHoldUntil(FRIDAY_2359, midnight), null);
  assert.equal(
    jerusalemShabbatHoldUntil(SATURDAY_0000, midnight)?.toISOString(),
    SUNDAY_0000.toISOString(),
  );
  assert.equal(jerusalemShabbatHoldUntil(SUNDAY_0000, midnight), null);
  assert.equal(
    jerusalemShabbatHoldUntil(SUNDAY_0000)?.toISOString(),
    "2026-11-01T06:30:00.000Z",
  );
});

test("only ad-account stops, lost connections and undelivered leads are critical", () => {
  assert.deepEqual(
    [...CRITICAL_ALERT_KINDS],
    ["ad_account_stopped", "connection_lost", "lead_alert_failure"],
  );
  assert.equal(criticalAlertKind("account_disabled"), "ad_account_stopped");
  assert.equal(criticalAlertKind("ad_account_blocked"), "ad_account_stopped");
  assert.equal(
    criticalAlertKind("integration_disconnected"),
    "connection_lost",
  );
  assert.equal(criticalAlertKind("connection_lost"), "connection_lost");
  assert.equal(criticalAlertKind("lead_alert_failure"), "lead_alert_failure");
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
    assert.equal(criticalAlertKind(kind), null, String(kind));
  }
});

test("Saturday holds non-critical alerts and lets critical ones through", () => {
  assert.equal(isAlertHeldForShabbat("ad_disapproved", SATURDAY_0000), true);
  assert.equal(isAlertHeldForShabbat("campaign_stopped", SATURDAY_2359), true);
  assert.equal(isAlertHeldForShabbat("no_contact", SATURDAY_0000), true);
  assert.equal(isAlertHeldForShabbat("account_disabled", SATURDAY_0000), false);
  assert.equal(isAlertHeldForShabbat("connection_lost", SATURDAY_0000), false);
  assert.equal(
    isAlertHeldForShabbat("lead_alert_failure", SATURDAY_0000),
    false,
  );
  assert.equal(isAlertHeldForShabbat("ad_disapproved", FRIDAY_2359), false);
  assert.equal(isAlertHeldForShabbat("ad_disapproved", SUNDAY_0000), false);
});

test("a held campaign alert is released once after Shabbat; legacy rows never", () => {
  const held = {
    notified_at: null,
    details: { whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD },
  };
  assert.equal(shouldReleaseHeldCampaignAlert(held, SATURDAY_2359), false);
  assert.equal(shouldReleaseHeldCampaignAlert(held, SUNDAY_0000), true);
  assert.equal(
    shouldReleaseHeldCampaignAlert(
      { ...held, notified_at: SUNDAY_0000.toISOString() },
      SUNDAY_0000,
    ),
    false,
  );
  // An old row that simply never reached anyone must not be replayed.
  assert.equal(
    shouldReleaseHeldCampaignAlert(
      { notified_at: null, details: {} },
      SUNDAY_0000,
    ),
    false,
  );
  assert.equal(shouldReleaseHeldCampaignAlert(null, SUNDAY_0000), false);
});
