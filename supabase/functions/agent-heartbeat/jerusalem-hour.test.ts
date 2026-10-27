import { assertStrictEquals } from "jsr:@std/assert@1";

import { jerusalemHour } from "./jerusalem-hour.ts";

Deno.test("jerusalemHour", async (t) => {
  await t.step("follows DST where getUTCHours()+3 does not", () => {
    // Summer (IDT, UTC+3) and winter (IST, UTC+2) around 2026-10-25.
    assertStrictEquals(jerusalemHour(new Date("2026-10-24T04:30:00Z")), 7);
    assertStrictEquals(jerusalemHour(new Date("2026-10-26T04:30:00Z")), 6);
    assertStrictEquals(new Date("2026-10-26T04:30:00Z").getUTCHours() + 3, 7);
    // Midnight wraps to 0, never 24.
    assertStrictEquals(jerusalemHour(new Date("2026-07-01T21:30:00Z")), 0);
    assertStrictEquals(jerusalemHour(new Date("2026-12-31T22:15:00Z")), 0);
  });
});
