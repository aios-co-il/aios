import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import { ClientDashboardPanel } from "./ClientDashboardPanel";

const mocks = vi.hoisted(() => ({
  toJpeg: vi.fn(),
  sendReportWhatsApp: vi.fn(),
  recordDelivery: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("html-to-image", () => ({ toJpeg: mocks.toJpeg }));
vi.mock("@/lib/reportSync", () => ({
  waitForSnapshotReady: async () => undefined,
  syncReportTables: async () => [],
}));
vi.mock("@/components/report-sender/sendReportWhatsApp", () => ({
  sendReportWhatsApp: mocks.sendReportWhatsApp,
}));
vi.mock("@/hooks/useRecordReportDelivery", () => ({
  useRecordReportDelivery: () => ({ mutate: mocks.recordDelivery }),
}));
vi.mock("@/components/report-sender/useReportSenderChoice", () => ({
  useReportSenderChoice: () => ({ pick: { integrationId: "line-1" } }),
}));
vi.mock("@/components/report-sender/ReportSenderPicker", () => ({
  ReportSenderPicker: () => null,
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("../ClientReportCard/useClientSendContacts", () => ({
  useClientSendContacts: () => ({
    client: {
      id: "client-1",
      name: "לקוח",
      phone: "0501234567",
      email: null,
      whatsapp_group_id: null,
    },
    groups: [],
    teamMembers: [],
    loaded: true,
    failed: false,
  }),
}));
vi.mock("./dashboardShareToken", () => ({
  dashboardShareSource: (dashboard: { id: string }) => ({
    queryKey: ["dashboard-share-link", dashboard.id],
    label: "test",
    readActive: async () => "dash-token",
    create: async () => "dash-token",
  }),
}));
vi.mock("./useDashboardSync", () => ({
  useDashboardSync: () => ({
    sync: vi.fn(),
    syncing: false,
    loadingTables: false,
  }),
}));
vi.mock("@/pages/SharedDashboard", () => ({ default: FakeSharedDashboard }));

/** Stands in for the share page: shows its window and lets the viewer change it. */
function FakeSharedDashboard(props: {
  shareTokenOverride?: string;
  dateFilter?: string;
  onDateFilterChange?: (filter: string) => void;
  snapshotMode?: boolean;
}) {
  return (
    <div data-snapshot-ready="true" data-snapshot-frame="true">
      <span>
        {props.snapshotMode ? "capture" : "live"} {props.shareTokenOverride}{" "}
        {props.dateFilter}
      </span>
      {!props.snapshotMode && (
        <button
          type="button"
          onClick={() => props.onDateFilterChange?.("last_7_days")}
        >
          7 ימים
        </button>
      )}
    </div>
  );
}

const dashboard = { id: "dash-1", name: "דשבורד" };

/** The panel as the client card mounts it. */
function renderPanel() {
  return render(
    withTestQuery(
      <MemoryRouter>
        <ClientDashboardPanel
          dashboard={dashboard}
          clientId="client-1"
          tenantId="tenant-1"
        />
      </MemoryRouter>,
    ),
  );
}

beforeEach(() => {
  stubResizeObserver();
  vi.clearAllMocks();
  mocks.toJpeg.mockResolvedValue(
    `data:image/jpeg;base64,${btoa("x".repeat(2000))}`,
  );
  mocks.sendReportWhatsApp.mockResolvedValue({ deliveredAs: "media" });
});

describe("ClientDashboardPanel", () => {
  it("shows the live share dashboard and takes no picture on open", async () => {
    renderPanel();

    expect(
      await screen.findByText("live dash-token last_30_days"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("report-capture-frame")).toBeNull();
    expect(mocks.toJpeg).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("photographs the summary once on send, at the window picked in the card", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "7 ימים" }));
    await user.click(screen.getByRole("button", { name: /שלח סיכום/ }));

    await waitFor(() => expect(mocks.sendReportWhatsApp).toHaveBeenCalled());
    expect(mocks.toJpeg).toHaveBeenCalledTimes(1);
    const photographed = mocks.toJpeg.mock.calls[0][0] as HTMLElement;
    expect(photographed.textContent).toContain(
      "capture dash-token last_7_days",
    );
    const sent = mocks.sendReportWhatsApp.mock.calls[0][0];
    expect(sent.file).toBeInstanceOf(Blob);
    expect(sent.fileName).toBe("dashboard-דשבורד.jpg");
    expect(sent.phoneNumber).toBe("0501234567");
    expect(sent.sendKind).toBe("dashboard_share");
    expect(sent.caption).toContain("/shared/dashboard/dash-token");
    expect(mocks.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "dashboard",
        targetId: "dash-1",
        sent: ["whatsapp"],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("report-capture-frame")).toBeNull(),
    );
  });
});
