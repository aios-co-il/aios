import { describe, expect, it } from "vitest";
import { isNewSummary, pendingSince } from "./waitForRecordingSummary";

describe("isNewSummary", () => {
  const since = new Date("2026-11-12T10:00:00Z");

  it("accepts a summary generated after the request", () => {
    expect(
      isNewSummary(
        {
          summary_md: "## תקציר",
          summary_generated_at: "2026-11-12T10:03:00Z",
        },
        since,
      ),
    ).toBe(true);
  });

  it("ignores the old summary that was already there", () => {
    expect(
      isNewSummary(
        {
          summary_md: "## ישן",
          summary_generated_at: "2026-11-10T08:00:00Z",
        },
        since,
      ),
    ).toBe(false);
  });

  it("ignores a row with no summary", () => {
    expect(
      isNewSummary({ summary_md: null, summary_generated_at: null }, since),
    ).toBe(false);
    expect(isNewSummary(null, since)).toBe(false);
  });
});

describe("pendingSince", () => {
  const browserTime = new Date("2026-11-12T10:05:00Z");

  it("uses the server's request time, not a skewed browser clock", () => {
    expect(
      pendingSince({ requested_at: "2026-11-12T10:00:00Z" }, browserTime),
    ).toEqual(new Date("2026-11-12T10:00:00Z"));
  });

  it("falls back to the browser time when the reply has none", () => {
    expect(pendingSince({}, browserTime)).toBe(browserTime);
    expect(pendingSince({ requested_at: "not a date" }, browserTime)).toBe(
      browserTime,
    );
  });
});
