import { describe, expect, it } from "vitest";
import { isNewSummary } from "./waitForRecordingSummary";

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
