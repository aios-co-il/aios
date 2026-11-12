import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { createTestQueryHarness } from "@/test/withTestQuery";
import SharedDashboard from "./SharedDashboard";

/** A public-dashboard answer whose dashboard carries this name. */
function bodyNamed(name: string) {
  return {
    dashboard: {
      id: "dash-1",
      name,
      client_id: "client-1",
      client_name: "לקוח בדיקה",
      agency_name: "סוכנות בדיקה",
      dashboard_type: "client",
      settings: {},
    },
    tables: [],
    records: [],
    woocommerce: { sites: [], orders: [] },
    ahrefs_reports: [],
    seo_ga_records: [],
    seo_gsc_records: [],
    gsc_multi_period: null,
    maskyoo_snapshots: [],
    maskyoo_period: null,
    seo_keyword_relevance: { force_relevant: [], force_irrelevant: [] },
    seo_monthly: { months: [] },
    has_email_restriction: false,
  };
}

/**
 * The send capture's render of the dashboard over a cache that already holds
 * an older answer for the window, with public-dashboard answered by `answer`.
 */
function renderCapture(answer: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(answer));
  const { queryClient, wrapper } = createTestQueryHarness();
  queryClient.setQueryData(
    ["shared-dashboard", "share-token", "last_7_days"],
    bodyNamed("נתונים ישנים"),
    { updatedAt: 0 },
  );
  const view = render(
    <MemoryRouter>
      <SharedDashboard
        shareTokenOverride="share-token"
        dateFilter="last_7_days"
        snapshotMode
      />
    </MemoryRouter>,
    { wrapper },
  );
  return view.container;
}

beforeEach(() => {
  stubResizeObserver();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SharedDashboard snapshot readiness", () => {
  it("is not ready while the picked window's stale answer is refetched", async () => {
    let respond!: (response: Response) => void;
    const container = renderCapture(
      () => new Promise((resolve) => (respond = resolve)),
    );
    /** The capture frame the page renders once it has an answer. */
    function frame() {
      return container.querySelector<HTMLElement>(
        '[data-snapshot-frame="true"]',
      );
    }

    await waitFor(() => expect(frame()).not.toBeNull());
    expect(frame()?.dataset.snapshotReady).toBe("false");

    respond(new Response(JSON.stringify(bodyNamed("נתונים עדכניים"))));

    await waitFor(() => expect(frame()?.dataset.snapshotReady).toBe("true"));
    expect(frame()?.textContent).toContain("נתונים עדכניים");
  });

  it("raises the snapshot error when the refetch fails", async () => {
    const container = renderCapture(
      async () => new Response("public-dashboard down", { status: 500 }),
    );

    await waitFor(() =>
      expect(container.querySelector("[data-snapshot-error]")).not.toBeNull(),
    );
    expect(container.querySelector('[data-snapshot-ready="true"]')).toBeNull();
  });
});
