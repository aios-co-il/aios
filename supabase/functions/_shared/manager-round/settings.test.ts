import { assertEquals } from "jsr:@std/assert@1";
import { MANAGER_DEFAULTS, resolveManagerSettings } from "./settings.ts";

Deno.test("resolveManagerSettings", async (t) => {
  await t.step("a tenant without settings observes with the defaults", () => {
    for (const raw of [undefined, null, "x", [], {}, { manager: [] }]) {
      const settings = resolveManagerSettings(raw);
      assertEquals(settings.mode, "observe");
      assertEquals(settings.notify_since, null);
      assertEquals(settings.business_hours, MANAGER_DEFAULTS.business_hours);
      assertEquals(settings.escalation_hours, [4, 24]);
      assertEquals(settings.max_alerts_per_recipient_per_day, 8);
    }
  });

  await t.step("an unknown mode observes; the four modes are kept", () => {
    assertEquals(
      resolveManagerSettings({ manager: { mode: "loud" } }).mode,
      "observe",
    );
    for (const mode of ["off", "observe", "david_only", "team"]) {
      assertEquals(resolveManagerSettings({ manager: { mode } }).mode, mode);
    }
  });

  await t.step("keeps valid values and drops invalid ones", () => {
    const settings = resolveManagerSettings({
      manager: {
        mode: "team",
        notify_since: "2026-10-27T06:00:00Z",
        brief_recipients: ["u1", 7, "u2"],
        business_hours: { 0: [8, 17], 5: [9, 12], 6: [9, 12], 3: [12, 10] },
        holidays: ["2026-10-14", "tomorrow"],
        escalation_hours: [6, 2],
        sla_business_hours: -1,
        max_alerts_per_recipient_per_day: 5,
        cost: { trend_pct: 50 },
      },
    });
    assertEquals(settings.notify_since, "2026-10-27T06:00:00Z");
    assertEquals(settings.brief_recipients, ["u1", "u2"]);
    assertEquals(settings.business_hours, { 0: [8, 17], 5: [9, 12] });
    assertEquals(settings.holidays, ["2026-10-14"]);
    assertEquals(settings.escalation_hours, [4, 24]);
    assertEquals(settings.sla_business_hours, 4);
    assertEquals(settings.max_alerts_per_recipient_per_day, 5);
  });
});
