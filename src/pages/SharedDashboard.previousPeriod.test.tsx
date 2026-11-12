import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import SharedDashboard from "./SharedDashboard";

/** A UTC day this many days ago, as yyyy-MM-dd. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

const settings = { currency: "ILS", campaign_type: "leads" };

/** A Facebook campaign day as public-dashboard returns it. */
function facebookDay(id: string, date: string, leads: number) {
  return {
    id,
    created_at: `${date}T08:00:00Z`,
    data: {
      date,
      campaign_name: "לידים",
      campaign_type: "leads",
      spend: 100,
      clicks: 20,
      impressions: 1500,
      leads,
    },
    _source: "facebook_insights",
    _tableId: "facebook",
    _tableName: "Facebook",
    _integrationSettings: settings,
  };
}

/** A public-dashboard answer holding these records. */
function bodyWith(records: Array<ReturnType<typeof facebookDay>>) {
  return {
    dashboard: {
      id: "dash-1",
      name: "דשבורד לקוח",
      client_id: "client-1",
      client_name: "לקוח בדיקה",
      agency_name: "סוכנות בדיקה",
      dashboard_type: "client",
      settings: {},
    },
    tables: [
      {
        id: "facebook",
        name: "Facebook",
        integration_type: "facebook_insights",
        integration_settings: settings,
      },
      {
        id: "google",
        name: "Google Ads",
        integration_type: "google_ads",
        integration_settings: settings,
      },
    ],
    records,
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

/** The page at its share route, with public-dashboard answered by `fetch`. */
function renderPage() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const previous = url.searchParams.has("custom_start");
    const body = previous
      ? bodyWith([facebookDay("p1", daysAgo(40), 5)])
      : bodyWith([facebookDay("c1", daysAgo(2), 10)]);
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    withTestQuery(
      <MemoryRouter initialEntries={["/shared/dashboard/share-token"]}>
        <Routes>
          <Route
            path="/shared/dashboard/:shareToken"
            element={<SharedDashboard />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return fetchMock;
}

beforeAll(stubResizeObserver);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SharedDashboard previous-period comparison", () => {
  it("reads the previous window and shows the comparison columns", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const user = userEvent.setup();
    const fetchMock = renderPage();

    await screen.findByRole("heading", { name: "דשבורד לקוח" });
    await user.click(screen.getAllByRole("tab", { name: /Facebook/ })[0]);
    expect(screen.queryByText("תקופה קודמת")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /השוואה לתקופה קודמת/ }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("תקופה קודמת").length).toBeGreaterThan(0),
    );
    const previousCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.searchParams.has("custom_start"));
    // The previous 30 days end the day before the current window starts.
    expect(previousCall?.searchParams.get("custom_end")).toBe(daysAgo(31));
    expect(previousCall?.searchParams.get("custom_start")).toBe(daysAgo(60));
    // Leads went up from 5 to 10 and cost per lead down from 20 to 10.
    const leadsRow = screen.getByRole("row", { name: /לידים.*10/ });
    const cells = within(leadsRow)
      .getAllByTitle("תקופה קודמת")
      .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim());
    expect(cells).toContain("▲ 5");
    expect(cells.some((cell) => /^▼ .*20/.test(cell ?? ""))).toBe(true);
  });

  it("does not show the sync status or a back button to the client", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    renderPage();

    await screen.findByRole("heading", { name: "דשבורד לקוח" });
    expect(screen.getByText("לקוח בדיקה • סוכנות בדיקה")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/סנכרון/);
    expect(screen.queryByRole("button", { name: "חזרה" })).toBeNull();
  });
});
