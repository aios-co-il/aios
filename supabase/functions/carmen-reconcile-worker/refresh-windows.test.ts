import { assert, assertFalse, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { insideRefreshWindow, resyncAllowedAt } from "./refresh-windows.ts";

describe("resyncAllowedAt", () => {
  it("keeps half an hour clear of the next refresh window", () => {
    assert(resyncAllowedAt(new Date("2026-10-26T01:30:00Z")));
    assert(resyncAllowedAt(new Date("2026-10-26T01:59:00Z")));
    assertFalse(resyncAllowedAt(new Date("2026-10-26T02:10:00Z")));
    assertFalse(resyncAllowedAt(new Date("2026-10-26T03:00:00Z")));
    assertFalse(resyncAllowedAt(new Date("2026-10-26T11:05:00Z")));
    assert(resyncAllowedAt(new Date("2026-10-26T14:00:00Z")));
  });
});

describe("insideRefreshWindow", () => {
  it("covers the morning and afternoon syncs", () => {
    assertStrictEquals(
      insideRefreshWindow(new Date("2026-10-26T01:30:00Z")),
      false,
    );
    assertStrictEquals(
      insideRefreshWindow(new Date("2026-10-26T02:45:00Z")),
      true,
    );
    assertStrictEquals(
      insideRefreshWindow(new Date("2026-10-26T04:15:00Z")),
      true,
    );
    assertStrictEquals(
      insideRefreshWindow(new Date("2026-10-26T04:30:00Z")),
      false,
    );
    assertStrictEquals(
      insideRefreshWindow(new Date("2026-10-26T12:00:00Z")),
      true,
    );
  });
});
