import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { ClientReportPanel } from "./ClientReportPanel";

const mocks = vi.hoisted(() => {
  /** A client's send contacts as useClientSendContacts returns them once loaded. */
  function contactsOf(client: {
    id: string;
    phone: string | null;
    email: string | null;
    whatsapp_group_id: string | null;
  }) {
    return {
      client: { name: `לקוח ${client.id}`, ...client },
      groups: [{ id: "group-1", group_name: "קבוצת לקוח" }],
      teamMembers: [],
      loaded: true,
      failed: false,
    };
  }
  return {
    toPng: vi.fn(),
    sendReportWhatsApp: vi.fn(),
    emailReportImage: vi.fn(),
    recordDelivery: vi.fn(),
    toastError: vi.fn(),
    summaryError: null as string | null,
    contacts: {
      "client-1": contactsOf({
        id: "client-1",
        phone: "0501111111",
        email: "client@example.com",
        whatsapp_group_id: "group-1",
      }),
      "client-2": contactsOf({
        id: "client-2",
        phone: null,
        email: null,
        whatsapp_group_id: null,
      }),
      "client-blocked": contactsOf({
        id: "client-blocked",
        phone: "0502222222",
        email: null,
        whatsapp_group_id: "blocked-group",
      }),
    } as Record<string, unknown>,
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: mocks.toastError },
}));
vi.mock("html-to-image", () => ({ toPng: mocks.toPng }));
vi.mock("@/lib/reportSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reportSync")>()),
  syncReportTable: async () => ({ tableId: "table-1", status: "synced" }),
}));
vi.mock("@/components/report-sender/sendReportWhatsApp", () => ({
  sendReportWhatsApp: mocks.sendReportWhatsApp,
}));
vi.mock("../ClientReportCard/emailReportImage", () => ({
  emailReportImage: mocks.emailReportImage,
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
vi.mock("../ReportEmailSenderSelect", () => ({
  ReportEmailSenderSelect: () => null,
}));
vi.mock("../EmailRecipientsSelector", () => ({
  EmailRecipientsSelector: () => null,
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("./ReportLinkButtons", () => ({ ReportLinkButtons: () => null }));
vi.mock("../ClientReportCard/useClientSendContacts", () => ({
  useClientSendContacts: (clientId: string) => mocks.contacts[clientId],
}));
vi.mock("./tableShareToken", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tableShareToken")>()),
  tableShareSource: (table: { id: string }) => ({
    queryKey: ["table-share-token", table.id],
    label: "test",
    readActive: async () => "table-token",
    create: async () => "table-token",
  }),
}));
vi.mock("@/components/SharedTable/SharedTableReport", () => ({
  SharedTableReport: FakeSharedTableReport,
}));

/** Stands in for the share report; its summary fails to load when the test says so. */
function FakeSharedTableReport(props: { summaryOnly?: boolean }) {
  if (props.summaryOnly && mocks.summaryError) {
    return (
      <div data-snapshot-error={mocks.summaryError}>{mocks.summaryError}</div>
    );
  }
  return (
    <div data-snapshot-ready="true">
      {props.summaryOnly ? "summary" : "live"}
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

/** The panel for one client; rerendering it reuses the same query cache. */
function renderPanel(clientId: string) {
  const { wrapper } = createTestQueryHarness();
  /** The panel as the client card mounts it for this client. */
  function panel(id: string): ReactElement {
    return (
      <MemoryRouter>
        <ClientReportPanel table={table} clientId={id} tenantId="tenant-1" />
      </MemoryRouter>
    );
  }
  const view = render(panel(clientId), { wrapper });
  return { switchTo: (id: string) => view.rerender(panel(id)) };
}

beforeEach(() => {
  stubResizeObserver();
  vi.clearAllMocks();
  mocks.summaryError = null;
  mocks.toPng.mockResolvedValue(
    `data:image/png;base64,${btoa("x".repeat(2000))}`,
  );
  mocks.sendReportWhatsApp.mockResolvedValue({ deliveredAs: "media" });
  mocks.emailReportImage.mockResolvedValue(undefined);
});

describe("ClientReportPanel send", () => {
  it("still emails when WhatsApp fails, and records each channel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendReportWhatsApp.mockRejectedValue(new Error("green api down"));
    const user = userEvent.setup();
    renderPanel("client-1");

    await user.click(await screen.findByRole("checkbox", { name: /אימייל/ }));
    await user.click(screen.getByRole("button", { name: /שלח דוח/ }));

    await waitFor(() => expect(mocks.recordDelivery).toHaveBeenCalled());
    expect(mocks.emailReportImage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: expect.arrayContaining(["client@example.com"]),
      }),
    );
    expect(mocks.toastError).toHaveBeenCalledWith(
      "שגיאה בשליחה בוואטסאפ: green api down",
    );
    expect(mocks.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: { whatsapp: true, email: true },
        sent: ["email"],
      }),
    );
  });

  it("sends to the phone shown when the client's group is not one the picker lists", async () => {
    const user = userEvent.setup();
    renderPanel("client-blocked");

    expect(await screen.findByDisplayValue("0502222222")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /שלח דוח/ }));

    await waitFor(() => expect(mocks.sendReportWhatsApp).toHaveBeenCalled());
    const sent = mocks.sendReportWhatsApp.mock.calls[0][0];
    expect(sent.groupId).toBeNull();
    expect(sent.phoneNumber).toBe("0502222222");
  });

  it("drops the previous client's destination when the client switches", async () => {
    const user = userEvent.setup();
    const { switchTo } = renderPanel("client-1");
    await screen.findByText("live");

    switchTo("client-2");

    await waitFor(() =>
      expect(screen.getByPlaceholderText("05xxxxxxxx")).toHaveValue(""),
    );
    await user.click(screen.getByRole("button", { name: /שלח דוח/ }));
    expect(mocks.toastError).toHaveBeenCalledWith(
      "יש לבחור קבוצת וואטסאפ או להזין מספר טלפון",
    );
    expect(mocks.sendReportWhatsApp).not.toHaveBeenCalled();
  });

  it("aborts without sending when the summary fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.summaryError = "public-table failed";
    const user = userEvent.setup();
    renderPanel("client-1");

    await user.click(await screen.findByRole("button", { name: /שלח דוח/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "שגיאה בצילום: public-table failed",
      ),
    );
    expect(mocks.toPng).not.toHaveBeenCalled();
    expect(mocks.sendReportWhatsApp).not.toHaveBeenCalled();
    expect(mocks.recordDelivery).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId("report-capture-frame")).toBeNull(),
    );
  });
});
