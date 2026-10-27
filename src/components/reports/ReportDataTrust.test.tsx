import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDataTrust } from "./ReportDataTrust";

const state = vi.hoisted(() => {
  const runs: Array<Record<string, unknown>> = [];
  const calls: Array<[string, unknown[]]> = [];
  return { runs, calls };
});

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      state.calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve({ data: state.runs, error: null }).then(resolve, reject);
  return {
    supabase: {
      from: (table: string) => {
        state.calls.push(["from", [table]]);
        return builder;
      },
    },
  };
});

beforeEach(() => {
  state.runs = [];
  state.calls = [];
});

/** Renders the line in a fresh query client without retries. */
function renderLine(props: Parameters<typeof ReportDataTrust>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReportDataTrust {...props} />
    </QueryClientProvider>,
  );
}

const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("ReportDataTrust", () => {
  it("shows the matched line from the table's latest run", async () => {
    state.runs = [
      {
        status: "ok",
        started_at: recent,
        finished_at: recent,
        window_start: "2026-10-19",
        window_end: "2026-10-25",
        platform: "meta",
        summary: {},
      },
    ];
    renderLine({ tableId: "t1", integrationType: "facebook_insights" });
    expect(await screen.findByText("תואם לפלטפורמה ✓")).toBeTruthy();
    expect(state.calls).toContainEqual(["from", ["reconcile_runs"]]);
    expect(state.calls).toContainEqual(["eq", ["table_id", "t1"]]);
  });

  it("shows the gaps line", async () => {
    state.runs = [
      {
        status: "mismatch",
        started_at: recent,
        finished_at: recent,
        window_start: "2026-10-19",
        window_end: "2026-10-25",
        platform: "google",
        summary: { findings_total: 2 },
      },
    ];
    renderLine({ tableId: "t1", integrationType: "google_ads" });
    expect(await screen.findByText("נמצאו פערים מול הפלטפורמה")).toBeTruthy();
  });

  it("a night stopped by a rate limit keeps the previous result", async () => {
    const lastNight = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    state.runs = [
      {
        status: "skipped",
        started_at: lastNight,
        finished_at: lastNight,
        window_start: null,
        window_end: null,
        platform: "meta",
        summary: { skipped_reason: "platform_rate_limited" },
      },
      {
        status: "ok",
        started_at: recent,
        finished_at: recent,
        window_start: "2026-10-19",
        window_end: "2026-10-25",
        platform: "meta",
        summary: {},
      },
    ];
    renderLine({ tableId: "t1", integrationType: "facebook_insights" });
    expect(await screen.findByText("תואם לפלטפורמה ✓")).toBeTruthy();
  });

  it("does not query for tables that are not ad reports", () => {
    const { container } = renderLine({
      tableId: "t1",
      integrationType: "google_analytics",
    });
    expect(container.textContent).toBe("");
    expect(state.calls).toEqual([]);
  });
});
