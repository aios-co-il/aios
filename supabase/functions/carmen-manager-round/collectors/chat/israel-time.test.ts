import { assertEquals } from "jsr:@std/assert@1";
import { israelClock, israelDayAndClock } from "./israel-time.ts";

Deno.test("israel-time", async (t) => {
  await t.step("Israel wall-clock time in winter and summer", () => {
    assertEquals(israelClock(new Date("2026-10-27T07:05:00Z")), "09:05");
    assertEquals(israelClock(new Date("2026-07-01T21:30:00Z")), "00:30");
  });

  await t.step("day, month and time", () => {
    assertEquals(
      israelDayAndClock(new Date("2026-10-27T19:14:00Z")),
      "ב-27.10 בשעה 21:14",
    );
  });
});
