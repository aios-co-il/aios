import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { EditClientDialog } from "./EditClientDialog";
import {
  client,
  db,
  resetHarness,
  setPersona,
  toast,
  waitForFinanceAccess,
  writesTo,
} from "./__tests__/editClientDialogHarness";

describe("EditClientDialog finance fields", () => {
  it("lets a team manager without a grant save the client with no financial write and no error", async () => {
    setPersona({ isTeamManager: true }, { read: false, write: false });
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await waitForFinanceAccess();
    expect(screen.queryByLabelText(/ריטיינר/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "שמור שינויים" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(writesTo("clients")).toHaveLength(1);
    expect(writesTo("client_tenant_financial_data")).toHaveLength(0);
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a finance_view holder the retainer and budget read-only and never saves them", async () => {
    setPersona({}, { read: true, write: false });
    db.financialRow = { retainer: 5000, monthly_budget: 2000 };
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const retainer = await screen.findByLabelText(/ריטיינר/);
    await waitFor(() => expect(retainer).toHaveValue(5000));
    expect(retainer).toBeDisabled();
    expect(screen.getByLabelText(/תקציב חודשי/)).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "שמור שינויים" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(writesTo("client_tenant_financial_data")).toHaveLength(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("saves an owner's retainer and budget", async () => {
    setPersona({ isOwner: true }, { read: true, write: true });
    db.financialRow = { retainer: 5000, monthly_budget: 2000 };
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const retainer = await screen.findByLabelText(/ריטיינר/);
    await waitFor(() => expect(retainer).toHaveValue(5000));
    expect(retainer).toBeEnabled();
    await user.clear(retainer);
    await user.type(retainer, "6000");
    await user.click(screen.getByRole("button", { name: "שמור שינויים" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(writesTo("client_tenant_financial_data")).toEqual([
      {
        table: "client_tenant_financial_data",
        op: "upsert",
        payload: {
          client_id: "client-1",
          tenant_id: "tenant-1",
          retainer: 6000,
          monthly_budget: 2000,
        },
        options: { onConflict: "client_id,tenant_id" },
      },
    ]);
    expect(db.rpcCalls).toEqual(
      expect.arrayContaining([
        { name: "has_finance_permission", args: { _user_id: "user-1" } },
        { name: "has_finance_write_permission", args: { _user_id: "user-1" } },
      ]),
    );
  });

  it("hides the fields and still saves the client when finance access cannot be read", async () => {
    setPersona({ isOwner: true }, { read: true, write: true });
    db.accessError = { message: "rpc unavailable" };
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await waitForFinanceAccess();
    expect(screen.queryByLabelText(/ריטיינר/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "שמור שינויים" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(writesTo("client_tenant_financial_data")).toHaveLength(0);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("EditClientDialog ad-account links", () => {
  it("writes only the link field that was edited", async () => {
    setPersona({ isOwner: true }, { read: false, write: false });
    db.adLinks = {
      google_ads_url: null,
      meta_ads_url: "https://business.facebook.com/saved",
    };
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await waitForFinanceAccess();

    const google = await screen.findByLabelText("קישור ישיר לחשבון Google Ads");
    await user.type(google, "https://ads.google.com/aw/overview?ocid=1");
    await user.click(screen.getByRole("button", { name: "שמור שינויים" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [update] = writesTo("clients");
    expect(update.payload).toMatchObject({
      google_ads_url: "https://ads.google.com/aw/overview?ocid=1",
    });
    expect(update.payload).not.toHaveProperty("meta_ads_url");
  });

  it("leaves both links out when neither field was edited", async () => {
    setPersona({ isOwner: true }, { read: false, write: false });
    db.adLinks = {
      google_ads_url: "https://ads.google.com/aw/overview?ocid=1",
      meta_ads_url: null,
    };
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await waitForFinanceAccess();

    await user.click(screen.getByRole("button", { name: "שמור שינויים" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [update] = writesTo("clients");
    expect(update.payload).not.toHaveProperty("google_ads_url");
    expect(update.payload).not.toHaveProperty("meta_ads_url");
  });
});

beforeEach(resetHarness);

/** Renders the dialog for the test client. */
function renderDialog() {
  const onOpenChange = vi.fn();
  const { wrapper } = createTestQueryHarness();
  render(
    <EditClientDialog client={client} open onOpenChange={onOpenChange} />,
    { wrapper },
  );
  return { onOpenChange };
}

vi.mock("@/integrations/supabase/client", async () =>
  (await import("./__tests__/editClientDialogHarness")).supabaseModule(),
);

vi.mock("sonner", async () => ({
  toast: (await import("./__tests__/editClientDialogHarness")).toast,
}));
vi.mock("@/hooks/useUserRole", async () => {
  const { role } = await import("./__tests__/editClientDialogHarness");
  return { useUserRole: () => role };
});
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("@/hooks/useCustomFieldLabels", () => ({
  useCustomFieldLabels: () => ({
    getFieldLabel: (_key: string, fallback: string) => fallback,
  }),
}));
vi.mock("@/hooks/useTerminology", () => ({
  useTerminology: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/useFolderLinksAndAttachments", () => ({
  useFolderLinksAndAttachments: () => ({
    folderLinks: [],
    setFolderLinks: vi.fn(),
    attachments: [],
    setAttachments: vi.fn(),
    filesCount: 0,
  }),
}));
vi.mock("@/hooks/useMeetingScheduler", () => ({
  useMeetingScheduler: () => ({
    getAvailableTimeSlots: () => [],
    getAvailableEndTimeSlots: () => [],
    meetingTime: "",
    meetingEndTime: "",
  }),
}));
vi.mock("@/hooks/useEntityLists", () => ({
  useAgencies: () => ({ data: [{ id: "agency-1", name: "סוכנות בדיקה" }] }),
}));
vi.mock("@/components/clients/CampaignerAssignmentPicker", () => ({
  CampaignerAssignmentPicker: () => null,
}));
vi.mock("@/components/clients/ClientConnectionsTab", () => ({
  ClientConnectionsTab: () => null,
}));
vi.mock("@/components/clients/ClientAutoSendTab/ClientAutoSendTab", () => ({
  ClientAutoSendTab: () => null,
}));
vi.mock("@/components/clients/ClientUpdatesTab", () => ({
  ClientUpdatesTab: () => null,
}));
vi.mock("@/components/clients/ClientLinkedFiles", () => ({
  ClientLinkedFiles: () => null,
}));
vi.mock("@/components/forms/FolderLinksField", () => ({
  FolderLinksField: () => null,
}));
vi.mock("@/components/forms/AttachmentsField", () => ({
  AttachmentsField: () => null,
}));
