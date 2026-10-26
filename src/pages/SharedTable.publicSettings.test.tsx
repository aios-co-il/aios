import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { toPublicTableSettings } from "../../supabase/functions/_shared/public-table-settings.ts";
import SharedTable from "./SharedTable";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/** Settings as a Google Ads sync stores them, credentials included. */
const storedGoogleSettings = {
  webhook_secret: "SECRET-webhook",
  access_token: "SECRET-access",
  refresh_token: "SECRET-refresh",
  currency: "USD",
  campaign_type: "leads",
  manual_roi: { closures: 7, revenue: 4200 },
};

/** Yesterday in local time: inside the default "last 7 days" window. */
function yesterday(): string {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
}

function respondWith(body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mountShare() {
  const { wrapper: Wrapper } = withTestQuery();
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={["/shared/table/share-token"]}>
        <Routes>
          <Route path="/shared/table/:shareToken" element={<SharedTable />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
}

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SharedTable with share-link settings", () => {
  it("renders an ads report from the filtered settings", async () => {
    const settings = toPublicTableSettings(storedGoogleSettings);
    expect(JSON.stringify(settings)).not.toContain("SECRET");
    respondWith({
      table: {
        id: "table-1",
        name: "דוח Google Ads",
        integration_type: "google_ads",
        integration_settings: settings,
        agency_name: "סוכנות בדיקה",
      },
      fields: [],
      records: [
        {
          id: "r1",
          data: {
            date: yesterday(),
            campaign_name: "קמפיין לידים",
            campaign_id: "c1",
            spend: 120,
            clicks: 30,
            impressions: 1000,
            conversions: 4,
          },
        },
      ],
      has_email_restriction: false,
    });

    mountShare();

    expect(
      await screen.findByRole("heading", { name: "דוח Google Ads" }),
    ).toBeInTheDocument();
    // manual_roi survives the allowlist and fills the viewer's ROI card.
    await userEvent.click(
      await screen.findByRole("button", { name: "סיכום ROI ידני" }),
    );
    expect(await screen.findByDisplayValue("7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4200")).toBeInTheDocument();
    // currency survives too: amounts are in dollars, not shekels.
    expect(document.body.textContent).toContain("$");
  });

  it("keeps the SEO tabs the share dialog hid", async () => {
    respondWith({
      table: {
        id: "seo-1",
        name: "דוח SEO",
        integration_type: "ahrefs",
        integration_settings: toPublicTableSettings({
          api_key: "SECRET-ahrefs",
          shared_tabs: { maskyoo: false, gsc: true },
          targetDomain: "example.co.il",
        }),
        agency_name: null,
        client_id: "client-1",
      },
      fields: [],
      records: [],
      ahrefs_reports: [],
      ga_table: null,
      ga_records: [],
      gsc_table: null,
      gsc_records: [],
      gsc_multi_period: null,
      maskyoo_snapshots: [],
      maskyoo_period: null,
      seo_monthly: { months: [] },
      has_email_restriction: false,
    });

    mountShare();

    // The SEO view refetches once it knows the share is SEO; wait for its tabs.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "דוח SEO" })).toBeVisible(),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("tab").length).toBeGreaterThan(0),
    );
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    // shared_tabs survives the allowlist: the calls tab stays hidden.
    expect(tabs.some((label) => label?.includes("מסקיו"))).toBe(false);
    expect(within(document.body).queryByText(/SECRET/)).toBeNull();
  });
});
