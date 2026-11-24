import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import SharedDashboard from "./SharedDashboard";

/** A public-dashboard answer with one empty Facebook table. */
const body = {
  dashboard: {
    id: "dash-1",
    name: "דשבורד לקוח",
    client_id: "client-1",
    client_name: "לקוח בדיקה",
    dashboard_type: "client",
    settings: {},
  },
  tables: [
    {
      id: "facebook",
      name: "Facebook",
      integration_type: "facebook_insights",
      integration_settings: { currency: "ILS" },
    },
  ],
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

/**
 * The page at its share route, with public-dashboard answered by `fetch`;
 * `refuseCustom` answers a custom window with the endpoint's 400.
 */
function renderPage({ refuseCustom = false } = {}) {
  const fetchMock = vi.fn(async (url: string) =>
    refuseCustom && new URL(url).searchParams.has("custom_start")
      ? new Response(JSON.stringify({ error: "Invalid date range" }), {
          status: 400,
        })
      : new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = render(
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
  return { fetchMock, container: view.container };
}

/** The query strings public-dashboard was asked with, in order. */
function requestedQueries(
  fetchMock: ReturnType<typeof renderPage>["fetchMock"],
) {
  return fetchMock.mock.calls.map(
    (call: Array<unknown>) => new URL(String(call[0])).searchParams,
  );
}

/** A day of this month as yyyy-MM-dd. */
function thisMonthDay(day: number): string {
  const now = new Date();
  return format(new Date(now.getFullYear(), now.getMonth(), day), "yyyy-MM-dd");
}

/** This month's calendar button for `day`, not a spill-over day. */
function dayButton(day: number): HTMLElement {
  const button = Array.from(
    document.querySelectorAll<HTMLElement>('button[name="day"]'),
  ).find(
    (candidate) =>
      candidate.textContent === String(day) &&
      !candidate.className.includes("day-outside"),
  );
  if (!button) {
    throw new Error(`no calendar day ${day}`);
  }
  return button;
}

beforeAll(() => {
  stubResizeObserver();
  // Radix Select needs these pointer and scroll APIs, which happy-dom lacks.
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    scrollIntoView: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Picks the custom preset, then `fromDay` and `toDay` of this month. */
async function pickCustomRange(
  user: ReturnType<typeof userEvent.setup>,
  fromDay: number,
  toDay: number,
) {
  await user.click(screen.getByRole("combobox"));
  await user.click(
    await screen.findByRole("option", { name: "טווח מותאם אישית" }),
  );
  if (!document.querySelector('button[name="day"]')) {
    await user.click(screen.getByRole("button", { name: /בחר תאריכים/ }));
  }
  await user.click(dayButton(fromDay));
  await user.click(dayButton(toDay));
}

describe("SharedDashboard custom range", () => {
  it("keeps the header and dates with a notice when public-dashboard refuses the window", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const user = userEvent.setup();
    const { container } = renderPage({ refuseCustom: true });
    await screen.findByRole("heading", { name: "דשבורד לקוח" });

    await pickCustomRange(user, 10, 12);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "לא ניתן להציג את הטווח שנבחר",
    );
    expect(screen.getByRole("heading", { name: "דשבורד לקוח" })).toBeTruthy();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.queryByText("לא ניתן לטעון את הדוח")).toBeNull();
    expect(
      container.querySelector('[data-snapshot-error="range_refused"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-snapshot-ready="true"]')).toBeNull();
  });

  it("reads the picked days from public-dashboard once both are picked", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const user = userEvent.setup();
    const { fetchMock } = renderPage();
    await screen.findByRole("heading", { name: "דשבורד לקוח" });

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "טווח מותאם אישית" }),
    );
    // The choice opens the calendar; in happy-dom the closing list's focus
    // return dismisses it, so open it from its button as a viewer can.
    if (!document.querySelector('button[name="day"]')) {
      await user.click(screen.getByRole("button", { name: /בחר תאריכים/ }));
    }
    await user.click(dayButton(10));

    // One day picked is not a range yet: nothing is read for it.
    expect(
      requestedQueries(fetchMock).some((query) => query.has("custom_start")),
    ).toBe(false);
    expect(screen.getByRole("heading", { name: "דשבורד לקוח" })).toBeTruthy();

    await user.click(dayButton(12));

    await waitFor(() =>
      expect(
        requestedQueries(fetchMock).find((query) => query.has("custom_start")),
      ).toBeTruthy(),
    );
    const customQuery = requestedQueries(fetchMock).find((query) =>
      query.has("custom_start"),
    );
    expect(customQuery?.get("token")).toBe("share-token");
    expect(customQuery?.get("date_filter")).toBe("custom");
    expect(customQuery?.get("custom_start")).toBe(thisMonthDay(10));
    expect(customQuery?.get("custom_end")).toBe(thisMonthDay(12));
  });
});
