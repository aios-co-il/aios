import { assertEquals } from "jsr:@std/assert@1";
import { contactRules } from "./rules.ts";

Deno.test("contactRules", async (t) => {
  await t.step("defaults: 24 h grace, 60 s calls, the pulse's 14 days", () => {
    assertEquals(contactRules(null), {
      logGraceHours: 24,
      minCallSeconds: 60,
      noContactDays: 14,
    });
  });

  await t.step(
    "manager.contact and the pulse's no_contact_days override",
    () => {
      assertEquals(
        contactRules({
          no_contact_days: 21,
          manager: { contact: { log_grace_hours: 8, min_call_seconds: 90 } },
        }),
        { logGraceHours: 8, minCallSeconds: 90, noContactDays: 21 },
      );
    },
  );

  await t.step("invalid values fall back", () => {
    assertEquals(
      contactRules({
        no_contact_days: "x",
        manager: { contact: { log_grace_hours: -1, min_call_seconds: "a" } },
      }),
      { logGraceHours: 24, minCallSeconds: 60, noContactDays: 14 },
    );
  });
});
