import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { eventPeriodWindows } from "./event-windows.ts";

describe("eventPeriodWindows", () => {
  it("skips dates that do not parse and puts a later month in last year", () => {
    const windows = eventPeriodWindows(
      ["10.10", "bad", "5.12"],
      7,
      new Date(2026, 10, 6),
    );
    assertEquals(
      windows.map((w) => [w.eventDate, w.endDate.slice(0, 4)]),
      [
        ["10.10", "2026"],
        ["5.12", "2025"],
      ],
    );
  });
});
