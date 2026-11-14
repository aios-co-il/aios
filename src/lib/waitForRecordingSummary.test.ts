import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNewSummary,
  pendingSince,
  SummaryFailedError,
  waitForRecordingSummary,
} from "./waitForRecordingSummary";

const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  },
}));

/** One poll's row: the summary fields and the failure mark. */
function row(fields: {
  summary_md?: string | null;
  summary_generated_at?: string | null;
  summary_failed_at?: string | null;
}) {
  return {
    data: {
      summary_md: null,
      summary_file_url: null,
      summary_generated_at: null,
      summary_failed_at: null,
      ...fields,
    },
    error: null,
  };
}

describe("waitForRecordingSummary", () => {
  const since = new Date("2026-11-14T10:00:00Z");
  const fast = { pollMs: 0, timeoutMs: 1_000 };

  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("stops at once when the server records a failure after the request", async () => {
    maybeSingle.mockResolvedValueOnce(
      row({ summary_failed_at: "2026-11-14T10:02:00Z" }),
    );

    await expect(
      waitForRecordingSummary("rec-1", since, fast),
    ).rejects.toBeInstanceOf(SummaryFailedError);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("ignores a failure from an earlier request and returns the new summary", async () => {
    maybeSingle
      .mockResolvedValueOnce(row({ summary_failed_at: "2026-11-13T09:00:00Z" }))
      .mockResolvedValueOnce(
        row({
          summary_md: "## תקציר",
          summary_generated_at: "2026-11-14T10:03:00Z",
          summary_failed_at: "2026-11-13T09:00:00Z",
        }),
      );

    await expect(
      waitForRecordingSummary("rec-1", since, fast),
    ).resolves.toEqual({ summary: "## תקציר", fileUrl: null });
  });
});

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
