import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportDataFreshness } from "@/components/reports/ReportDataFreshness";
import { getReportSyncProblem } from "@/lib/reportQueryOptions";

const LAST_WRITE = "2026-10-25T04:40:00.000Z";

describe("ReportDataFreshness", () => {
  it("warns next to the source time when the latest sync failed", () => {
    const table = {
      last_sync_at: LAST_WRITE,
      last_sync_outcome: {
        status: "failed",
        rows: 0,
        at: "2026-10-26T04:40:00.000Z",
      },
    };
    render(
      <ReportDataFreshness
        lastSyncAt={LAST_WRITE}
        syncProblem={getReportSyncProblem([table])}
      />,
    );
    expect(screen.getByText(/עדכון מקור:/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "הסנכרון האחרון נכשל — הנתונים לא עודכנו",
    );
  });

  it("names an empty run and stays quiet after a successful one", () => {
    const empty = {
      integration_settings: {
        last_sync_at: LAST_WRITE,
        last_sync_outcome: {
          status: "empty",
          rows: 0,
          at: "2026-10-26T04:40:00.000Z",
        },
      },
    };
    const { rerender } = render(
      <ReportDataFreshness
        lastSyncAt={LAST_WRITE}
        syncProblem={getReportSyncProblem([
          empty,
          { last_sync_at: LAST_WRITE },
        ])}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "הסנכרון האחרון לא החזיר נתונים",
    );

    rerender(
      <ReportDataFreshness
        lastSyncAt={LAST_WRITE}
        syncProblem={getReportSyncProblem([
          {
            last_sync_at: LAST_WRITE,
            last_sync_outcome: { status: "ok", rows: 12, at: LAST_WRITE },
          },
        ])}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
