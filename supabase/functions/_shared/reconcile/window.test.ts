import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { completeDaysWindow, pendingDates, zonedDayStart } from "./window.ts";

describe("completeDaysWindow", () => {
  it("covers 7 complete days ending yesterday in the account's time zone", () => {
    // 22:30 UTC on Oct 25 is already Oct 26 in Israel but still Oct 25 in LA.
    const now = new Date("2026-10-25T22:30:00Z");
    const il = completeDaysWindow(now, "Asia/Jerusalem");
    assertEquals(
      [il.start, il.end, il.today],
      ["2026-10-19", "2026-10-25", "2026-10-26"],
    );
    assertStrictEquals(il.dates.length, 7);
    const la = completeDaysWindow(now, "America/Los_Angeles");
    assertEquals([la.start, la.end], ["2026-10-18", "2026-10-24"]);
    const utc = completeDaysWindow(now, "UTC");
    assertEquals([utc.start, utc.end], ["2026-10-18", "2026-10-24"]);
  });

  it("falls back to UTC for an unknown time zone and says so", () => {
    const w = completeDaysWindow(new Date("2026-10-26T01:30:00Z"), "Mars/Base");
    assertStrictEquals(w.timezone, "UTC");
    assertStrictEquals(w.timezone_fallback, true);
    assertStrictEquals(w.end, "2026-10-25");
  });
});

describe("zonedDayStart", () => {
  it("finds midnight across DST changes", () => {
    // Israel leaves DST on 2026-10-25 at 02:00, so that day starts at +03:00.
    assertStrictEquals(
      zonedDayStart("2026-10-25", "Asia/Jerusalem").toISOString(),
      "2026-10-24T21:00:00.000Z",
    );
    assertStrictEquals(
      zonedDayStart("2026-10-26", "Asia/Jerusalem").toISOString(),
      "2026-10-25T22:00:00.000Z",
    );
    // New York enters DST at 02:00 on 2026-03-08; midnight is still -05:00.
    assertStrictEquals(
      zonedDayStart("2026-03-08", "America/New_York").toISOString(),
      "2026-03-08T05:00:00.000Z",
    );
    assertStrictEquals(
      zonedDayStart("2026-03-09", "America/New_York").toISOString(),
      "2026-03-09T04:00:00.000Z",
    );
  });
});

describe("pendingDates", () => {
  it("holds yesterday back until a sync ran after it ended", () => {
    const now = new Date("2026-10-26T01:30:00Z");
    const w = completeDaysWindow(now, "Asia/Jerusalem");
    // Oct 25 ends at 22:00 UTC in Israel. The afternoon sync at 11:45 UTC is before that.
    assertEquals(pendingDates(w, "2026-10-25T11:45:00Z"), ["2026-10-25"]);
    assertEquals(pendingDates(w, "2026-10-25T22:00:00Z"), []);
    // Never synced: compare everything (the gap shows as missing days).
    assertEquals(pendingDates(w, null), []);
    // A New York account's yesterday (Oct 24) ended at 04:00 UTC on Oct 25.
    const ny = completeDaysWindow(now, "America/New_York");
    assertStrictEquals(ny.end, "2026-10-24");
    assertEquals(pendingDates(ny, "2026-10-25T11:45:00Z"), []);
  });
});
