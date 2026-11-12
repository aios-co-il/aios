import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedDateSelection } from "@/components/SharedTable/useSharedTableData";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import { ClientReportPanel } from "./ClientReportPanel";

const mocks = vi.hoisted(() => ({
  toPng: vi.fn(),
  sendReportWhatsApp: vi.fn(),
  recordDelivery: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("html-to-image", () => ({ toPng: mocks.toPng }));
vi.mock("@/lib/reportSync", () => ({
  waitForSnapshotReady: async () => undefined,
  syncReportTable: async () => ({ tableId: "table-1", status: "synced" }),
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
vi.mock("./ReportLinkButtons", () => ({ ReportLinkButtons: () => null }));
vi.mock("../ClientReportCard/useClientSendContacts", () => ({
  useClientSendContacts: () => ({
    client: {
      name: "לקוח",
      phone: null,
      email: null,
      whatsapp_group_id: "group-1",
    },
    groups: [{ id: "group-1", group_name: "קבוצת לקוח" }],
    teamMembers: [],
  }),
}));
vi.mock("./tableShareToken", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tableShareToken")>()),
  tableShareSource: (table: { id: string }) => ({
    queryKey: ["table-share-token", table.id],
    readActive: async () => "table-token",
    ensure: async () => "table-token",
  }),
}));
vi.mock("@/components/SharedTable/SharedTableReport", () => ({
  SharedTableReport: FakeSharedTableReport,
}));

/** Stands in for the share report: shows its window and lets the viewer change it. */
function FakeSharedTableReport(props: {
  shareToken: string;
  dates?: SharedDateSelection;
  onDatesChange?: (dates: SharedDateSelection) => void;
  summaryOnly?: boolean;
}) {
  return (
    <div data-snapshot-ready="true">
      <span>
        {props.summaryOnly ? "summary" : "live"} {props.shareToken}{" "}
        {props.dates?.filter}
      </span>
      {!props.summaryOnly && (
        <button
          type="button"
          onClick={() => props.onDatesChange?.({ filter: "last_30_days" })}
        >
          30 ימים
        </button>
      )}
    </div>
  );
}

const table = {
  id: "table-1",
  name: "פייסבוק",
  slug: "facebook",
  tenant_id: "tenant-1",
  integration_type: "facebook_insights",
};

/** The panel as the client card mounts it. */
function renderPanel() {
  return render(
    withTestQuery(
      <MemoryRouter>
        <ClientReportPanel
          table={table}
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
  mocks.toPng.mockResolvedValue(
    `data:image/png;base64,${btoa("x".repeat(2000))}`,
  );
  mocks.sendReportWhatsApp.mockResolvedValue({ deliveredAs: "media" });
});

describe("ClientReportPanel", () => {
  it("shows the live share report and takes no picture on open", async () => {
    renderPanel();

    expect(
      await screen.findByText("live table-token last_7_days"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("report-capture-frame")).toBeNull();
    expect(mocks.toPng).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("photographs the summary once on send, at the window picked in the card", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "30 ימים" }));
    await user.click(screen.getByRole("button", { name: /שלח דוח/ }));

    await waitFor(() => expect(mocks.sendReportWhatsApp).toHaveBeenCalled());
    expect(mocks.toPng).toHaveBeenCalledTimes(1);
    const photographed = mocks.toPng.mock.calls[0][0] as HTMLElement;
    expect(photographed.textContent).toContain(
      "summary table-token last_30_days",
    );
    const sent = mocks.sendReportWhatsApp.mock.calls[0][0];
    expect(sent.file).toBeInstanceOf(Blob);
    expect(sent.fileName).toBe("report-פייסבוק.png");
    expect(sent.groupId).toBe("group-1");
    expect(sent.sendKind).toBe("report");
    expect(sent.caption).toContain(
      "https://aios.co.il/shared/table/table-token",
    );
    expect(mocks.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "table",
        targetId: "table-1",
        sent: ["whatsapp"],
      }),
    );
  });

  it("sends nothing and records nothing when the summary cannot be photographed", async () => {
    mocks.toPng.mockResolvedValue("data:,");
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /שלח דוח/ }));

    await waitFor(() => expect(mocks.toPng).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByTestId("report-capture-frame")).toBeNull(),
    );
    expect(mocks.sendReportWhatsApp).not.toHaveBeenCalled();
    expect(mocks.recordDelivery).not.toHaveBeenCalled();
  });
});
