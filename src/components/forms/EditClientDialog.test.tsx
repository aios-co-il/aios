import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { EditClientDialog } from "./EditClientDialog";

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

type Write = {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
};

const db = vi.hoisted(() => ({
  access: { read: false, write: false },
  accessError: null as null | { message: string },
  financialRow: null as null | { retainer: number; monthly_budget: number },
  writes: [] as Write[],
  rpcCalls: [] as { name: string; args: unknown }[],
}));

const role = vi.hoisted(() => ({
  isOwner: false,
  isSuperAdmin: false,
  isCampaigner: false,
  isTeamManager: false,
  isAgencyOwner: false,
  userId: "user-1",
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

const client = {
  id: "client-1",
  name: "לקוח בדיקה",
  agency_id: "agency-1",
  status: "active",
  retainer: null,
  monthly_budget: null,
};

beforeEach(() => {
  db.access = { read: false, write: false };
  db.accessError = null;
  db.financialRow = null;
  db.writes = [];
  db.rpcCalls = [];
});

function setPersona(
  flags: Partial<typeof role>,
  access: { read: boolean; write: boolean },
) {
  Object.assign(role, {
    isOwner: false,
    isSuperAdmin: false,
    isTeamManager: false,
    isAgencyOwner: false,
    ...flags,
  });
  db.access = access;
}

function renderDialog() {
  const onOpenChange = vi.fn();
  const { wrapper } = withTestQuery();
  render(
    <EditClientDialog client={client} open onOpenChange={onOpenChange} />,
    { wrapper },
  );
  return { onOpenChange };
}

async function waitForFinanceAccess() {
  await waitFor(() => expect(db.rpcCalls).toHaveLength(2));
}

function writesTo(table: string) {
  return db.writes.filter((write) => write.table === table);
}

vi.mock("@/integrations/supabase/client", () => {
  /** What the database returns for one finished query. */
  const resultFor = (table: string, op: string, single: boolean) => {
    if (table === "clients" && op === "update") {
      return { data: [{ id: "client-1" }], error: null };
    }
    if (table === "client_tenant_financial_data" && op === "select") {
      return { data: db.financialRow, error: null };
    }
    return { data: single || op !== "select" ? null : [], error: null };
  };

  /** A chainable PostgREST stand-in that records writes and resolves when awaited. */
  const from = (table: string) => {
    let op = "select";
    let single = false;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const name of ["select", "eq", "in", "not", "is", "or", "order"]) {
      builder[name] = chain;
    }
    for (const kind of ["insert", "update", "upsert", "delete"]) {
      builder[kind] = (payload?: unknown, options?: unknown) => {
        op = kind;
        db.writes.push({ table, op: kind, payload, options });
        return builder;
      };
    }
    builder.maybeSingle = () => {
      single = true;
      return builder;
    };
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(resultFor(table, op, single)).then(resolve, reject);
    return builder;
  };

  const rpc = async (name: string, args: unknown) => {
    db.rpcCalls.push({ name, args });
    if (db.accessError) {
      return { data: null, error: db.accessError };
    }
    const allowed =
      name === "has_finance_write_permission"
        ? db.access.write
        : db.access.read;
    return { data: allowed, error: null };
  };

  return { supabase: { from, rpc } };
});

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => role }));
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
