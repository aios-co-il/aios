import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previousPeriodRange } from "@/components/reports/PreviousPeriod/previousPeriod";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import { SharedTableReport } from "./SharedTableReport";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/** A Facebook sales campaign's day: purchases without purchase value or cart. */
function salesDay(daysAgo: number, spend: number, purchases: number) {
  return {
    id: `r-${daysAgo}`,
    data: {
      date: format(subDays(new Date(), daysAgo), "yyyy-MM-dd"),
      entity_level: "campaign",
      campaign_id: "c1",
      campaign_name: "קמפיין מכירות",
      campaign_objective: "OUTCOME_SALES",
      impressions: 1000,
      clicks: 40,
      spend,
      purchases,
    },
  };
}

const table = {
  id: "table-1",
  name: "דוח פייסבוק",
  integration_type: "facebook_insights",
  integration_settings: { currency: "ILS" },
  agency_name: "סוכנות בדיקה",
};

/**
 * Answers public-table like the edge function: the shown window by default,
 * and the previous window when the page asks for a custom range.
 */
function stubPublicTable() {
  const fetchMock = vi.fn(async (url: string) => {
    const previous = new URL(url).searchParams.has("custom_start");
    const records = previous ? [salesDay(9, 50, 1)] : [salesDay(2, 120, 3)];
    return new Response(JSON.stringify({ table, fields: [], records }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(stubResizeObserver);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SharedTableReport", () => {
  it("renders the internal sales table, with cost per purchase", async () => {
    stubPublicTable();
    render(withTestQuery(<SharedTableReport shareToken="share-token" />));

    expect(
      await screen.findByRole("heading", { name: "דוח פייסבוק" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("עלות לרכישה")).toBeInTheDocument();
    expect(screen.getByText("קמפיין מכירות")).toBeInTheDocument();
    expect(screen.getByText("סוכנות בדיקה")).toBeInTheDocument();
    expect(screen.queryByText("תקופה קודמת")).toBeNull();
  });

  it("shows the summary without controls, ending at the snapshot marker, when summaryOnly", async () => {
    stubPublicTable();
    const { container } = render(
      withTestQuery(
        <SharedTableReport
          shareToken="share-token"
          dates={{ filter: "last_30_days" }}
          summaryOnly
        />,
      ),
    );

    expect(await screen.findByText("עלות לרכישה")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /השוואה לתקופה קודמת/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /30 יום אחרונים/ })).toBeNull();
    expect(
      container.querySelector('[data-snapshot-end="true"]'),
    ).not.toBeNull();
    await waitFor(() =>
      expect(
        container.querySelector('[data-snapshot-ready="true"]'),
      ).not.toBeNull(),
    );
  });

  it("asks public-table for the window the host holds", async () => {
    const fetchMock = stubPublicTable();
    render(
      withTestQuery(
        <SharedTableReport
          shareToken="share-token"
          dates={{ filter: "last_30_days" }}
          onDatesChange={() => undefined}
        />,
      ),
    );

    await screen.findByText("עלות לרכישה");
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("date_filter")).toBe("last_30_days");
  });

  it("adds the previous period's columns when the comparison is on", async () => {
    const fetchMock = stubPublicTable();
    const user = userEvent.setup();
    render(withTestQuery(<SharedTableReport shareToken="share-token" />));

    await user.click(
      await screen.findByRole("button", { name: /השוואה לתקופה קודמת/ }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("תקופה קודמת").length).toBeGreaterThan(0),
    );
    const previousUrl = fetchMock.mock.calls
      .map(([url]) => new URL(url))
      .find((url) => url.searchParams.has("custom_start"));
    // The 7 days before the default "last 7 days", from the same endpoint.
    expect(previousUrl?.pathname).toContain("/functions/v1/public-table");
    expect(previousUrl?.searchParams.get("date_filter")).toBe("custom");
    const expected = previousPeriodRange("last_7_days", null, null);
    expect(previousUrl?.searchParams.get("custom_start")).toBe(
      expected?.startDate,
    );
    expect(previousUrl?.searchParams.get("custom_end")).toBe(expected?.endDate);
  });
});
