import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { ClientAutoSendTab } from "./ClientAutoSendTab";

type Row = Record<string, unknown>;

const backend = vi.hoisted(() => ({
  canManage: true,
  card: {} as Row,
  optIns: [] as Row[],
  refusals: [] as Row[],
  upsertError: null as { message: string } | null,
  /** Holds the save until released, to look at the switch meanwhile. */
  upsertGate: null as Promise<void> | null,
  upsert: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string) => ({
      data: name === "can_manage_client_auto_sends" ? backend.canManage : null,
      error: null,
    }),
    from: (table: string) => fakeTable(table),
  },
}));

/** A PostgREST builder that answers each table from `backend`. */
function fakeTable(table: string) {
  const rows: Record<string, Row[]> = {
    client_auto_send_opt_ins: backend.optIns,
    client_send_refusals: backend.refusals,
  };
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    order: () => query,
    limit: () => query,
    single: async () => ({ data: backend.card, error: null }),
    upsert: async (row: Row, options: Row) => {
      backend.upsert(row, options);
      await backend.upsertGate;
      if (!backend.upsertError) {
        backend.optIns = [
          ...backend.optIns.filter(
            (saved) =>
              saved.send_kind !== row.send_kind || saved.target !== row.target,
          ),
          row,
        ];
      }
      return { error: backend.upsertError };
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
  };
  return query;
}

const LEADS_TO_GROUP = "התראות על לידים חדשים: קבוצת הוואטסאפ של הלקוח";
const LEADS_TO_PHONE =
  "התראות על לידים חדשים: וואטסאפ אישי (הטלפון בכרטיס ואנשי הקשר)";
const AUTOMATION_BY_EMAIL = "אוטומציות אחרות של הארגון: אימייל";

function renderTab() {
  const { wrapper } = withTestQuery();
  return render(<ClientAutoSendTab clientId="client-1" />, { wrapper });
}

beforeEach(() => {
  backend.canManage = true;
  backend.card = {
    tenant_id: "client-tenant",
    phone: null,
    email: "",
    whatsapp_group_id: "group-1",
    client_contacts: [{ phone: "0501234567", email: null }],
  };
  backend.optIns = [];
  backend.refusals = [];
  backend.upsertError = null;
  backend.upsertGate = null;
});

describe("ClientAutoSendTab", () => {
  it("starts with every switch off and says nothing is sent by default", async () => {
    renderTab();
    expect(await screen.findAllByRole("switch")).toHaveLength(9);
    for (const toggle of screen.getAllByRole("switch")) {
      expect(toggle).not.toBeChecked();
    }
    expect(
      screen.getByText(/הלקוח לא מקבל שום הודעה אוטומטית/),
    ).toBeInTheDocument();
  });

  it("shows the switches the card turned on", async () => {
    backend.optIns = [
      { send_kind: "lead_alert", target: "whatsapp_group", enabled: true },
      { send_kind: "lead_alert", target: "whatsapp_direct", enabled: false },
    ];
    renderTab();
    expect(
      await screen.findByRole("switch", { name: LEADS_TO_GROUP }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: LEADS_TO_PHONE }),
    ).not.toBeChecked();
  });

  it("stores a switch on the client's own tenant", async () => {
    renderTab();
    await userEvent.click(
      await screen.findByRole("switch", { name: LEADS_TO_GROUP }),
    );
    await waitFor(() =>
      expect(backend.upsert).toHaveBeenCalledWith(
        {
          tenant_id: "client-tenant",
          client_id: "client-1",
          send_kind: "lead_alert",
          target: "whatsapp_group",
          enabled: true,
        },
        { onConflict: "tenant_id,client_id,send_kind,target" },
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("ההגדרה נשמרה");
  });

  it("holds the new position while saving, and keeps it once saved", async () => {
    let release = () => {};
    backend.upsertGate = new Promise((resolve) => {
      release = resolve;
    });
    renderTab();
    const toggle = await screen.findByRole("switch", { name: LEADS_TO_GROUP });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    // One save at a time: the other switches wait for it.
    expect(screen.getByRole("switch", { name: LEADS_TO_PHONE })).toBeDisabled();
    release();
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: LEADS_TO_PHONE }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("switch", { name: LEADS_TO_GROUP })).toBeChecked();
  });

  it("stores turning a switch off as enabled false", async () => {
    backend.optIns = [
      { send_kind: "lead_alert", target: "whatsapp_group", enabled: true },
    ];
    renderTab();
    await userEvent.click(
      await screen.findByRole("switch", { name: LEADS_TO_GROUP }),
    );
    await waitFor(() =>
      expect(backend.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        expect.anything(),
      ),
    );
  });

  it("says when the switch was not saved", async () => {
    backend.upsertError = { message: "new row violates row-level security" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderTab();
    await userEvent.click(
      await screen.findByRole("switch", { name: LEADS_TO_GROUP }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("שמירת ההגדרה נכשלה"),
    );
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("is read-only for someone who may not manage the card", async () => {
    backend.canManage = false;
    renderTab();
    expect(
      await screen.findByText(
        "רק בעלים, בעלי סוכנות או מנהל הצוות של הלקוח יכולים לשנות",
      ),
    ).toBeInTheDocument();
    for (const toggle of screen.getAllByRole("switch")) {
      expect(toggle).toBeDisabled();
    }
  });

  it("puts a target the card lacks off limits and says why", async () => {
    backend.card = { ...backend.card, whatsapp_group_id: null };
    renderTab();
    expect(
      await screen.findByText("אין קבוצה מקושרת בכרטיס"),
    ).toBeInTheDocument();
    expect(screen.getByText("אין אימייל בכרטיס")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: LEADS_TO_GROUP })).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: AUTOMATION_BY_EMAIL }),
    ).toBeDisabled();
    // A contact's phone is enough for personal WhatsApp.
    expect(screen.queryByText("אין טלפון בכרטיס")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: LEADS_TO_PHONE })).toBeEnabled();
  });

  it("lists blocked and observed refusals with their reasons", async () => {
    backend.refusals = [
      {
        id: "r1",
        created_at: "2026-10-27T10:00:00Z",
        reason: "staff_only",
        enforced: true,
      },
      {
        id: "r2",
        created_at: "2026-10-26T10:00:00Z",
        reason: "unclassified_service_send",
        enforced: false,
      },
    ];
    renderTab();
    expect(
      await screen.findByText("שליחות אוטומטיות שנחסמו (30 יום)"),
    ).toBeInTheDocument();
    expect(screen.getByText("הודעה פנימית לצוות")).toBeInTheDocument();
    expect(screen.getByText("נחסם")).toBeInTheDocument();
    expect(screen.getByText("שליחה אוטומטית לא מסווגת")).toBeInTheDocument();
    expect(screen.getByText("ייחסם כשההגנה תופעל")).toBeInTheDocument();
  });

  it("hides the refusal list while there are none", async () => {
    renderTab();
    await screen.findAllByRole("switch");
    expect(
      screen.queryByText(/שליחות אוטומטיות שנחסמו/),
    ).not.toBeInTheDocument();
  });
});
