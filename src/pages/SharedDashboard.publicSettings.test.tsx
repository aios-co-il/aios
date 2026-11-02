import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import { toPublicTableSettings } from "../../supabase/functions/_shared/share-links/public-table-settings.ts";
import SharedDashboard from "./SharedDashboard";

/** Yesterday in UTC: inside the default "last 30 days" window. */
function yesterday(): string {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return day.toISOString().slice(0, 10);
}

beforeAll(stubResizeObserver);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SharedDashboard with share-link settings", () => {
  it("renders a client dashboard from the filtered settings", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const googleSettings = toPublicTableSettings({
      webhook_secret: "SECRET-webhook",
      refresh_token: "SECRET-refresh",
      currency: "USD",
      campaign_type: "leads",
    });
    const facebookSettings = toPublicTableSettings({
      access_token: "SECRET-access",
      currency: "USD",
      campaign_type: "leads",
    });
    const body = {
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
          id: "google",
          name: "Google Ads",
          integration_type: "google_ads",
          integration_settings: googleSettings,
        },
        {
          id: "facebook",
          name: "Facebook",
          integration_type: "facebook_insights",
          integration_settings: facebookSettings,
        },
      ],
      records: [
        {
          id: "g1",
          created_at: `${yesterday()}T08:00:00Z`,
          data: {
            date: yesterday(),
            campaign_name: "חיפוש",
            spend: 250,
            clicks: 50,
            impressions: 2000,
            conversions: 5,
          },
          _source: "google_ads",
          _tableName: "Google Ads",
          _integrationSettings: googleSettings,
        },
        {
          id: "f1",
          created_at: `${yesterday()}T08:00:00Z`,
          data: {
            date: yesterday(),
            campaign_name: "לידים",
            spend: 100,
            clicks: 20,
            impressions: 1500,
            leads: 4,
          },
          _source: "facebook_insights",
          _tableName: "Facebook",
          _integrationSettings: facebookSettings,
        },
      ],
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
    expect(JSON.stringify(body)).not.toContain("SECRET");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { wrapper: Wrapper } = withTestQuery();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/shared/dashboard/share-token"]}>
          <Routes>
            <Route
              path="/shared/dashboard/:shareToken"
              element={<SharedDashboard />}
            />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );

    expect(
      await screen.findByRole("heading", { name: "דשבורד לקוח" }),
    ).toBeInTheDocument();
    // currency survives the allowlist: spend shows in dollars.
    expect(document.body.textContent).toContain("$");
    expect(document.body.textContent).not.toContain("₪");
  });
});
