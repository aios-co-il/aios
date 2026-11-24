import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardAnalyticsTab } from "./DashboardAnalyticsTab";

const mocks = vi.hoisted(() => ({
  analytics: vi.fn(),
  trackedEvents: vi.fn(),
}));

vi.mock("@/components/dynamic-tables/GoogleAnalyticsDashboard", () => ({
  GoogleAnalyticsDashboard: (props: unknown) => {
    mocks.analytics(props);
    return null;
  },
}));
vi.mock(
  "@/components/dynamic-tables/TrackedEvents/DashboardTrackedEvents",
  () => ({
    DashboardTrackedEvents: (props: unknown) => {
      mocks.trackedEvents(props);
      return null;
    },
  }),
);

/** The tab as the signed-in dashboard renders it, at `customDateRange`. */
function renderTab(customDateRange: { from?: Date; to?: Date }) {
  render(
    <DashboardAnalyticsTab
      records={[]}
      analyticsRecords={[]}
      settings={{}}
      adsSpend={0}
      formatCurrency={String}
      formatNumber={String}
      source={{ dashboardId: "dash-1" }}
      dateFilter="custom"
      customDateRange={customDateRange}
      analyticsTableIds={["ga-1", "ga-2"]}
      reportMode="leads"
      dashboardId="dash-1"
      editableDashboardId="dash-1"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardAnalyticsTab", () => {
  it("gives the GA report and the site goals the picked custom days", () => {
    const from = new Date(2026, 9, 3);
    const to = new Date(2026, 9, 20);

    renderTab({ from, to });

    expect(mocks.analytics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        externalDateFilter: "custom",
        externalCustomDateRange: { from, to },
        dashboardId: "dash-1",
        tableId: "ga-1",
        relatedTableIds: ["ga-2"],
        defaultReportMode: "leads",
      }),
    );
    expect(mocks.trackedEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateFilter: "custom",
        customFrom: "2026-10-03",
        customTo: "2026-10-20",
        editableDashboardId: "dash-1",
      }),
    );
  });

  it("passes no days while the custom range is half picked", () => {
    const from = new Date(2026, 9, 3);

    renderTab({ from });

    expect(mocks.analytics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        externalCustomDateRange: { from, to: undefined },
      }),
    );
    expect(mocks.trackedEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ customFrom: "2026-10-03", customTo: "" }),
    );
  });
});
