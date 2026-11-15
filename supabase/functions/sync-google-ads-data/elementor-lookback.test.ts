import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  coveredFromFetched,
  ELEMENTOR_MAX_LOOKBACK_DAYS,
  elementorLookback,
} from "./elementor-lookback.ts";

/** fetch-elementor-submissions' own filter: keep submissions newer than now - days. */
function keptByFetch(createdAt: string, days: number, now: Date): boolean {
  return new Date(createdAt).getTime() >= now.getTime() - days * 86400000;
}

const today = "2026-11-15";
const lateEvening = new Date("2026-11-15T21:30:00Z");

Deno.test("elementorLookback", async (t) => {
  await t.step(
    "a past 30-day piece fetches submissions back to its first day",
    () => {
      const lookback = elementorLookback("2026-09-16", today);

      assertEquals(lookback.days, 62);
      assertEquals(lookback.coveredFrom, "2026-09-16");
      assert(keptByFetch("2026-09-16 00:00:00", lookback.days, lateEvening));
      assert(keptByFetch("2026-09-20 10:00:00", lookback.days, lateEvening));
    },
  );

  await t.step("the newest piece keeps the whole of its oldest day", () => {
    const lookback = elementorLookback("2026-10-15", today);

    assertEquals(lookback.coveredFrom, "2026-10-15");
    assert(keptByFetch("2026-10-15 00:00:00", lookback.days, lateEvening));
  });

  await t.step(
    "a window older than the fetch limit is capped and marks what is covered",
    () => {
      const lookback = elementorLookback("2026-06-01", today);

      assertEquals(lookback.days, ELEMENTOR_MAX_LOOKBACK_DAYS);
      assertEquals(lookback.coveredFrom, "2026-08-19");
      assert(keptByFetch("2026-08-19 00:00:00", lookback.days, lateEvening));
    },
  );

  await t.step("a window of today alone still fetches today", () => {
    const lookback = elementorLookback(today, today);

    assertEquals(lookback.coveredFrom, today);
    assert(keptByFetch("2026-11-15 00:00:00", lookback.days, lateEvening));
  });
});

Deno.test("coveredFromFetched", async (t) => {
  await t.step("a complete fetch keeps the lookback's coverage", () => {
    assertEquals(
      coveredFromFetched("2026-09-16", {
        truncated: false,
        submissions: [{ created_at: "2026-10-01 10:00:00" }],
      }),
      "2026-09-16",
    );
  });

  await t.step(
    "a fetch cut at the page cap covers only the days after its oldest submission",
    () => {
      assertEquals(
        coveredFromFetched("2026-09-16", {
          truncated: true,
          submissions: [
            { created_at: "2026-11-14 09:00:00" },
            { created_at: "2026-10-20 18:00:00" },
          ],
        }),
        "2026-10-21",
      );
    },
  );
});
