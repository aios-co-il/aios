import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { ReportDataTrust } from "./ReportDataTrust";

const state = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  calls: [] as Array<[string, unknown[]]>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"])
    builder[method] = (...args: unknown[]) => {
      state.calls.push([method, args]);
      return builder;
    };
  builder.maybeSingle = () => Promise.resolve({ data: state.run, error: null });
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
  state.run = null;
  state.calls = [];
});

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

test("shows the matched line from the table's latest run", async () => {
  state.run = {
    status: "ok",
    started_at: recent,
    finished_at: recent,
    window_start: "2026-10-19",
    window_end: "2026-10-25",
    platform: "meta",
    summary: {},
  };
  renderLine({ tableId: "t1", integrationType: "facebook_insights" });
  expect(await screen.findByText("תואם לפלטפורמה ✓")).toBeTruthy();
  expect(state.calls).toContainEqual(["from", ["reconcile_runs"]]);
  expect(state.calls).toContainEqual(["eq", ["table_id", "t1"]]);
});

test("shows the gaps line", async () => {
  state.run = {
    status: "mismatch",
    started_at: recent,
    finished_at: recent,
    window_start: "2026-10-19",
    window_end: "2026-10-25",
    platform: "google",
    summary: { findings_total: 2 },
  };
  renderLine({ tableId: "t1", integrationType: "google_ads" });
  expect(await screen.findByText("נמצאו פערים מול הפלטפורמה")).toBeTruthy();
});

test("does not query for tables that are not ad reports", () => {
  const { container } = renderLine({
    tableId: "t1",
    integrationType: "google_analytics",
  });
  expect(container.textContent).toBe("");
  expect(state.calls).toEqual([]);
});
