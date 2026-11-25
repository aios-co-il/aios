import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  insideRefreshWindow,
  REFRESH_WINDOWS_UTC,
  resyncAllowedAt,
} from "./refresh-windows.ts";

function at(time: string): Date {
  return new Date(`2026-11-25T${time}:00Z`);
}

describe("REFRESH_WINDOWS_UTC", () => {
  it("covers each of the five daily ads sync runs, 04:50 to 18:30 UTC", () => {
    assertEquals(REFRESH_WINDOWS_UTC, [
      [4 * 60 + 50, 6 * 60 + 30],
      [7 * 60 + 50, 9 * 60 + 30],
      [10 * 60 + 50, 12 * 60 + 30],
      [13 * 60 + 50, 15 * 60 + 30],
      [16 * 60 + 50, 18 * 60 + 30],
    ]);
  });
});

describe("insideRefreshWindow", () => {
  it("covers every scheduled run and its pulse refresh", () => {
    for (const time of ["05:05", "08:05", "11:05", "14:05", "17:05"]) {
      assert(insideRefreshWindow(at(time)), time);
    }
    assert(insideRefreshWindow(at("06:29")));
    assertFalse(insideRefreshWindow(at("06:30")));
    assertFalse(insideRefreshWindow(at("02:45")));
  });
});

describe("resyncAllowedAt", () => {
  it("never starts during a scheduled run", () => {
    for (const time of ["05:05", "08:05", "14:05", "17:05"]) {
      assertFalse(resyncAllowedAt(at(time)), time);
    }
  });

  it("keeps half an hour clear of the next refresh window", () => {
    assert(resyncAllowedAt(at("01:30")));
    assert(resyncAllowedAt(at("04:19")));
    assertFalse(resyncAllowedAt(at("04:20")));
    assert(resyncAllowedAt(at("06:30")));
    assert(resyncAllowedAt(at("07:19")));
    assertFalse(resyncAllowedAt(at("07:20")));
    assert(resyncAllowedAt(at("18:30")));
  });
});
