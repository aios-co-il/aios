import { assertEquals } from "jsr:@std/assert@1";
import { MANAGER_DEFAULTS } from "../../_shared/manager-round/settings.ts";
import {
  addBusinessHours,
  businessDaysLater,
  isBusinessTime,
  nextBusinessStart,
} from "./business-hours.ts";

const calendar = {
  business_hours: MANAGER_DEFAULTS.business_hours,
  holidays: [] as string[],
};
const at = (iso: string) => new Date(iso);

Deno.test("business hours (Israel time)", async (t) => {
  await t.step("isBusinessTime (Israel time, winter UTC+2)", () => {
    assertEquals(isBusinessTime(at("2026-11-01T08:00:00Z"), calendar), true); // Sun 10:00
    assertEquals(isBusinessTime(at("2026-11-01T18:00:00Z"), calendar), false); // Sun 20:00
    assertEquals(isBusinessTime(at("2026-10-30T10:00:00Z"), calendar), true); // Fri 12:00
    assertEquals(isBusinessTime(at("2026-10-30T11:30:00Z"), calendar), false); // Fri 13:30
    assertEquals(isBusinessTime(at("2026-10-31T09:00:00Z"), calendar), false); // Shabbat
  });

  await t.step("nextBusinessStart skips Shabbat and holidays", () => {
    const friAfternoon = at("2026-10-30T12:00:00Z"); // Fri 14:00
    assertEquals(
      nextBusinessStart(friAfternoon, calendar).toISOString(),
      "2026-11-01T07:00:00.000Z",
    );
    const holiday = { ...calendar, holidays: ["2026-11-01"] };
    assertEquals(
      nextBusinessStart(friAfternoon, holiday).toISOString(),
      "2026-11-02T07:00:00.000Z",
    );
    const inside = at("2026-11-02T09:15:00Z");
    assertEquals(
      nextBusinessStart(inside, calendar).toISOString(),
      inside.toISOString(),
    );
  });

  await t.step(
    "addBusinessHours carries over evenings, Friday and Shabbat",
    () => {
      // Thu 17:00 + 4h = Thu 17–19 + Fri 09–11.
      assertEquals(
        addBusinessHours(at("2026-10-29T15:00:00Z"), 4, calendar).toISOString(),
        "2026-10-30T09:00:00.000Z",
      );
      // Fri 12:00 + 4h = Fri 12–13 + Sun 09–12.
      assertEquals(
        addBusinessHours(at("2026-10-30T10:00:00Z"), 4, calendar).toISOString(),
        "2026-11-01T10:00:00.000Z",
      );
      // Sun 09:00 + 24h = Sun 10h + Mon 10h + Tue 09–13.
      assertEquals(
        addBusinessHours(
          at("2026-11-01T07:00:00Z"),
          24,
          calendar,
        ).toISOString(),
        "2026-11-03T11:00:00.000Z",
      );
      // Sat 22:00 (outside) + 1h = Sun 10:00.
      assertEquals(
        addBusinessHours(at("2026-10-31T20:00:00Z"), 1, calendar).toISOString(),
        "2026-11-01T08:00:00.000Z",
      );
    },
  );

  await t.step("addBusinessHours across both DST changes", () => {
    // Thu 18:00 (UTC+2) + 2h = Thu 18–19 + Fri 09–10 (UTC+3 from Friday 02:00).
    assertEquals(
      addBusinessHours(at("2027-03-25T16:00:00Z"), 2, calendar).toISOString(),
      "2027-03-26T07:00:00.000Z",
    );
    // Sat 22:00 (UTC+3) + 1h = Sun 2026-10-25 10:00, after the clocks went back.
    assertEquals(
      addBusinessHours(at("2026-10-24T19:00:00Z"), 1, calendar).toISOString(),
      "2026-10-25T08:00:00.000Z",
    );
  });
});

Deno.test("businessDaysLater opens the business day n days on", () => {
  const thursday = at("2026-10-29T15:00:00Z"); // Thu 17:00
  assertEquals(
    businessDaysLater(thursday, 2, calendar).toISOString(),
    "2026-11-01T07:00:00.000Z", // Fri, (Shabbat skipped) Sun 09:00
  );
  const holiday = { ...calendar, holidays: ["2026-11-01"] };
  assertEquals(
    businessDaysLater(thursday, 2, holiday).toISOString(),
    "2026-11-02T07:00:00.000Z",
  );
});
