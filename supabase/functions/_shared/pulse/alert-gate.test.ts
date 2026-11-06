import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { campaignMayAlert, gatePulseAlert } from "./alert-gate.ts";

const running = { goal: "leads", deliveryStatus: "active", spend3d: 50 };

Deno.test("campaignMayAlert", async (t) => {
  await t.step("a running lead or sales campaign may alert", () => {
    assertStrictEquals(campaignMayAlert(running), true);
    assertStrictEquals(
      campaignMayAlert({ ...running, goal: "ecommerce" }),
      true,
    );
  });

  await t.step("traffic never alerts", () => {
    assertStrictEquals(
      campaignMayAlert({ ...running, goal: "engagement" }),
      false,
    );
  });

  await t.step(
    "no spend in the last 3 days, or paused, removed or ended: no alert",
    () => {
      assertStrictEquals(campaignMayAlert({ ...running, spend3d: 0 }), false);
      for (const deliveryStatus of ["paused", "removed", "ended"]) {
        assertStrictEquals(
          campaignMayAlert({ ...running, deliveryStatus }),
          false,
        );
      }
    },
  );
});

Deno.test(
  "gatePulseAlert keeps the reason and turns a held alert yellow",
  () => {
    const exception = {
      status: "critical" as const,
      tier: "exception" as const,
      reason: "קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים",
      alertEligible: true,
    };
    assertEquals(gatePulseAlert(exception, running), exception);
    assertEquals(gatePulseAlert(exception, { ...running, spend3d: 0 }), {
      ...exception,
      status: "warning",
      alertEligible: false,
    });
  },
);
