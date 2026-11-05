import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  isJerusalemShabbat,
  jerusalemLocalTimeToUtc,
  jerusalemShabbatHoldUntil,
} from "./quiet-window.ts";

const FRIDAY_2359 = new Date("2026-10-30T21:59:00Z"); // IST, UTC+2
const SATURDAY_0000 = new Date("2026-10-30T22:00:00Z");
const SATURDAY_2359 = new Date("2026-10-31T21:59:00Z");
const SUNDAY_0000 = new Date("2026-10-31T22:00:00Z");
const SATURDAY_11 = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_0830 = new Date("2026-11-01T06:30:00Z");

Deno.test("isJerusalemShabbat", async (t) => {
  await t.step(
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
});

Deno.test("jerusalemLocalTimeToUtc", async (t) => {
  await t.step("Israel wall-clock conversion is DST-safe", () => {
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
});

Deno.test("jerusalemShabbatHoldUntil", async (t) => {
  await t.step(
    "hold window: from Saturday 00:00, past midnight, until Sunday 08:30",
    () => {
      assertStrictEquals(jerusalemShabbatHoldUntil(FRIDAY_2359), null);
      assertStrictEquals(
        jerusalemShabbatHoldUntil(SATURDAY_0000)?.toISOString(),
        SUNDAY_0830.toISOString(),
      );
      assertStrictEquals(
        jerusalemShabbatHoldUntil(SUNDAY_0000)?.toISOString(),
        "2026-11-01T06:30:00.000Z",
      );
    },
  );

  await t.step("the task window is Saturday plus Sunday until 08:30", () => {
    assertStrictEquals(
      jerusalemShabbatHoldUntil(SATURDAY_11)?.toISOString(),
      SUNDAY_0830.toISOString(),
    );
    assertStrictEquals(jerusalemShabbatHoldUntil(SUNDAY_0830), null);
  });

  await t.step(
    "task notifications are held from Saturday 00:00 until Sunday 08:30 Israel",
    () => {
      const sunday0830 = "2026-11-01T06:30:00.000Z";
      assertStrictEquals(
        jerusalemShabbatHoldUntil(new Date("2026-10-30T21:59:00Z")),
        null,
      ); // Fri 23:59
      assertStrictEquals(
        jerusalemShabbatHoldUntil(
          new Date("2026-10-30T22:00:00Z"),
        )?.toISOString(), // Sat 00:00
        sunday0830,
      );
      assertStrictEquals(
        jerusalemShabbatHoldUntil(
          new Date("2026-10-31T21:59:00Z"),
        )?.toISOString(), // Sat 23:59
        sunday0830,
      );
      assertStrictEquals(
        jerusalemShabbatHoldUntil(
          new Date("2026-11-01T06:29:00Z"),
        )?.toISOString(), // Sun 08:29
        sunday0830,
      );
      // Sunday 08:30: the worker's next minute run delivers what was held.
      assertStrictEquals(jerusalemShabbatHoldUntil(new Date(sunday0830)), null);
      assertStrictEquals(
        jerusalemShabbatHoldUntil(new Date("2026-11-02T03:00:00Z")),
        null,
      ); // Mon 05:00
    },
  );
});
