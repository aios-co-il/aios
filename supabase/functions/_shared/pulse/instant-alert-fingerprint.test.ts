import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_PULSE_ALERT_RULES,
  evaluatePulseInstantAlerts,
} from "../pulse-instant-alerts.ts";
import { ACME, WEDNESDAY } from "./fake-alert-log.ts";
import {
  connectionLostFingerprint,
  cplSpikeFingerprint,
  noContactFingerprint,
} from "./instant-alert-fingerprint.ts";

Deno.test("evaluatePulseInstantAlerts", async (t) => {
  await t.step("client-level rules get deterministic fingerprints", () => {
    const rows = evaluatePulseInstantAlerts(
      [ACME],
      [],
      DEFAULT_PULSE_ALERT_RULES,
      WEDNESDAY.getTime(),
    );
    const byRule = Object.fromEntries(
      rows.map((row) => [row.rule_type, row.fingerprint]),
    );
    assertStrictEquals(byRule.no_contact, "no_contact:c1:missing");
    assertStrictEquals(byRule.connection_lost, "connection_lost:c1:open");
    const again = evaluatePulseInstantAlerts(
      [ACME],
      [],
      DEFAULT_PULSE_ALERT_RULES,
      WEDNESDAY.getTime() + 3600e3,
    );
    assertEquals(
      again.map((row) => row.fingerprint),
      rows.map((row) => row.fingerprint),
    );
  });
});

Deno.test("noContactFingerprint", async (t) => {
  await t.step(
    "keyed by the last contact's Israel date, or missing when there is none",
    () => {
      assertStrictEquals(
        noContactFingerprint("c1", Number.NaN),
        "no_contact:c1:missing",
      );
      // 23:30 UTC on the 26th is already the 27th in Israel.
      assertStrictEquals(
        noContactFingerprint("c1", Date.parse("2026-10-26T23:30:00Z")),
        "no_contact:c1:last:2026-10-27",
      );
    },
  );
});

Deno.test("cplSpikeFingerprint and connectionLostFingerprint", async (t) => {
  await t.step("one finding per client, whatever the detail", () => {
    assertStrictEquals(cplSpikeFingerprint("c1"), "cpl_spike:c1:spike");
    assertStrictEquals(
      connectionLostFingerprint("c1"),
      "connection_lost:c1:open",
    );
  });
});
