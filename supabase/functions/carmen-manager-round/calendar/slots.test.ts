import { assertEquals } from "jsr:@std/assert@1";
import { BRIEF_CRON } from "../../_shared/manager-round/brief-schedule.ts";
import { LIST_CRON, latestSlot, nextWorkingSlot } from "./slots.ts";

const iso = (date: Date | null) => date?.toISOString() ?? null;

Deno.test("latestSlot", async (t) => {
  await t.step("finds the brief slot within the stale window", () => {
    assertEquals(
      iso(latestSlot(BRIEF_CRON, new Date("2026-11-01T06:07:00Z"))),
      "2026-11-01T06:00:00.000Z",
    );
    assertEquals(
      iso(latestSlot(BRIEF_CRON, new Date("2026-11-01T06:59:00Z"))),
      "2026-11-01T06:00:00.000Z",
    );
  });

  await t.step("skips a stale slot instead of replaying it", () => {
    assertEquals(
      latestSlot(BRIEF_CRON, new Date("2026-11-01T07:30:00Z")),
      null,
    );
  });

  await t.step(
    "has no brief on Shabbat and returns the latest of several slots",
    () => {
      assertEquals(
        latestSlot(BRIEF_CRON, new Date("2026-10-31T06:07:00Z")),
        null,
      );
      assertEquals(
        iso(latestSlot("*/15 * * * *", new Date("2026-11-01T06:40:00Z"))),
        "2026-11-01T06:30:00.000Z",
      );
    },
  );

  await t.step("follows summer time", () => {
    assertEquals(
      iso(latestSlot(BRIEF_CRON, new Date("2026-06-07T05:10:00Z"))),
      "2026-06-07T05:00:00.000Z",
    );
  });
});

Deno.test(
  "nextWorkingSlot moves the list past Friday, Shabbat and holidays",
  () => {
    const friday = new Date("2026-10-30T08:00:00Z");
    const calendar = { business_hours: {}, holidays: [] as string[] };
    assertEquals(
      iso(nextWorkingSlot(LIST_CRON, friday, calendar)),
      "2026-11-01T06:30:00.000Z",
    );
    assertEquals(
      iso(
        nextWorkingSlot(LIST_CRON, friday, {
          ...calendar,
          holidays: ["2026-11-01"],
        }),
      ),
      "2026-11-02T06:30:00.000Z",
    );
    const exact = new Date("2026-11-02T06:30:00Z");
    assertEquals(
      iso(nextWorkingSlot(LIST_CRON, exact, calendar)),
      exact.toISOString(),
    );
  },
);
