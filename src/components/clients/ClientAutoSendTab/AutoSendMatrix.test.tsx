import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { AutoSendMatrix } from "./AutoSendMatrix";
import { backend, resetBackend } from "./fakeAutoSendBackend";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./fakeAutoSendBackend")).fakeSupabase,
}));

const LEADS_TO_GROUP = "התראות על לידים חדשים: קבוצת הוואטסאפ של הלקוח";
const LEADS_TO_PHONE =
  "התראות על לידים חדשים: וואטסאפ אישי (הטלפון בכרטיס ואנשי הקשר)";
const AUTOMATION_BY_EMAIL = "אוטומציות אחרות של הארגון: אימייל";

/** The switches of client-1, with a fresh query client. */
function renderMatrix() {
  const { wrapper } = withTestQuery();
  return render(<AutoSendMatrix clientId="client-1" />, { wrapper });
}

beforeEach(resetBackend);

describe("AutoSendMatrix", () => {
  it("shows the switches the card turned on", async () => {
    backend.optIns = [
      { send_kind: "lead_alert", target: "whatsapp_group", enabled: true },
      { send_kind: "lead_alert", target: "whatsapp_direct", enabled: false },
    ];
    renderMatrix();
    expect(
      await screen.findByRole("switch", { name: LEADS_TO_GROUP }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: LEADS_TO_PHONE }),
    ).not.toBeChecked();
  });

  it("stores a switch on the client's own tenant", async () => {
    renderMatrix();
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
    renderMatrix();
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
    renderMatrix();
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
    renderMatrix();
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
    renderMatrix();
    expect(
      await screen.findByText(
        "רק בעלים, בעלי סוכנות או מנהל הצוות של הלקוח יכולים לשנות",
      ),
    ).toBeInTheDocument();
    for (const toggle of screen.getAllByRole("switch")) {
      expect(toggle).toBeDisabled();
    }
  });

  it("puts a target the client lacks off limits and says why", async () => {
    backend.targets = { ...backend.targets, whatsapp_group: false };
    renderMatrix();
    expect(
      await screen.findByText("אין קבוצה מקושרת בכרטיס"),
    ).toBeInTheDocument();
    expect(screen.getByText("אין אימייל בכרטיס")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: LEADS_TO_GROUP })).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: AUTOMATION_BY_EMAIL }),
    ).toBeDisabled();
    expect(screen.queryByText("אין טלפון בכרטיס")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: LEADS_TO_PHONE })).toBeEnabled();
  });

  it("lets a switch left on for a target the card lost be turned off", async () => {
    backend.targets = { ...backend.targets, whatsapp_group: false };
    backend.optIns = [
      { send_kind: "lead_alert", target: "whatsapp_group", enabled: true },
    ];
    renderMatrix();
    const toggle = await screen.findByRole("switch", { name: LEADS_TO_GROUP });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(backend.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ target: "whatsapp_group", enabled: false }),
        expect.anything(),
      ),
    );
  });

  it("says when the permission check failed and stays read-only", async () => {
    backend.failing = ["can_manage_client_auto_sends"];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderMatrix();
    expect(
      await screen.findByText(/בדיקת ההרשאה לשינוי נכשלה/),
    ).toBeInTheDocument();
    for (const toggle of screen.getAllByRole("switch")) {
      expect(toggle).toBeDisabled();
    }
    expect(screen.queryByText(/רק בעלים, בעלי סוכנות/)).not.toBeInTheDocument();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it.each([
    ["the switches", "client_auto_send_opt_ins"],
    ["the card's targets", "client_auto_send_targets"],
    ["the card's tenant", "clients"],
  ])("says when %s failed to load", async (_what, failing) => {
    backend.failing = [failing];
    renderMatrix();
    expect(await screen.findByText("טעינת ההגדרה נכשלה")).toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});
