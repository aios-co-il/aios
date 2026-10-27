import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reportSender } from "../../../supabase/functions/_shared/report-sender/fixture.ts";
import { withTestQuery } from "@/test/withTestQuery";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { ClientReportScheduleSettings } from "./ClientReportScheduleSettings";

type Backend = {
  senders: ReportSender[];
  tenantDefault: string | null;
  schedule: Record<string, unknown> | null;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

const backend = vi.hoisted((): Backend => ({
  senders: [],
  tenantDefault: null,
  schedule: null,
  update: vi.fn(),
  insert: vi.fn(),
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: async () => ({ data: backend.senders, error: null }),
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        update: (payload: unknown) => {
          backend.update(payload);
          return query;
        },
        insert: (payload: unknown) => {
          backend.insert(payload);
          return query;
        },
        maybeSingle: async () => ({
          data:
            table === "report_schedules"
              ? backend.schedule
              : { whatsapp_integration_id: backend.tenantDefault },
          error: null,
        }),
        then: (resolve: (value: { error: null }) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  },
}));

const carmen = reportSender("carmen", { integration_type: "manus_wa" });
const david = reportSender("david", { owner_name: "דוד", owner_user_id: "u1" });
const office = reportSender("office", { display_name: "משרד" });

/** The schedule form of one table report, over the mocked backend. */
function renderSettings() {
  const { wrapper } = withTestQuery();
  return render(
    <ClientReportScheduleSettings
      clientId="client-1"
      tenantId="t1"
      target={{ kind: "table", id: "table-1", name: "דוח חודשי" }}
    />,
    { wrapper },
  );
}

beforeAll(() => {
  // Radix Select needs these pointer and scroll APIs, which happy-dom lacks.
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    scrollIntoView: () => {},
  });
});

/** Submits the form; backend.update or backend.insert records the row. */
async function save() {
  await userEvent.click(screen.getByRole("button", { name: "שמור הגדרה" }));
}

beforeEach(() => {
  backend.update.mockClear();
  backend.insert.mockClear();
  toastError.mockClear();
  backend.tenantDefault = null;
  backend.schedule = {
    id: "schedule-1",
    enabled: true,
    frequency: "monthly",
    day_of_month: 1,
    send_time: "09:00",
    channels: ["whatsapp"],
    email_recipients: [],
    message: null,
    whatsapp_integration_id: null,
  };
});

describe("ClientReportScheduleSettings sender line", () => {
  it("says which phone sends when there is only one, and stores it", async () => {
    backend.senders = [carmen];
    renderSettings();
    expect(
      await screen.findByText("יישלח מ: הטלפון של כרמן"),
    ).toBeInTheDocument();
    await save();
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_integration_id: "carmen" }),
      ),
    );
  });

  it("saves the line chosen for the schedule", async () => {
    backend.senders = [carmen, david];
    renderSettings();
    const select = await screen.findByRole("combobox", { name: "שלח מ" });
    // Preselected: the line the worker would use, the saver's own phone.
    expect(select).toHaveTextContent("הטלפון של דוד");
    await userEvent.click(select);
    await userEvent.click(
      await screen.findByRole("option", { name: "הטלפון של כרמן" }),
    );
    await save();
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith(
        expect.objectContaining({
          whatsapp_integration_id: "carmen",
          channels: ["whatsapp"],
        }),
      ),
    );
  });

  it("pins a legacy schedule to the line it resolves to", async () => {
    backend.senders = [carmen, david];
    renderSettings();
    const select = await screen.findByRole("combobox", { name: "שלח מ" });
    expect(select).toHaveTextContent("הטלפון של דוד");
    await save();
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_integration_id: "david" }),
      ),
    );
  });

  it("keeps a stored choice to follow the organization default", async () => {
    backend.senders = [carmen, david];
    backend.tenantDefault = "carmen";
    renderSettings();
    const select = await screen.findByRole("combobox", { name: "שלח מ" });
    expect(select).toHaveTextContent("ברירת המחדל של הארגון (הטלפון של כרמן)");
    await save();
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_integration_id: null }),
      ),
    );
  });

  it("stores the default's line itself on a new schedule", async () => {
    backend.senders = [carmen, david];
    backend.tenantDefault = "carmen";
    backend.schedule = null;
    renderSettings();
    await userEvent.click(await screen.findByRole("switch"));
    await screen.findByRole("combobox", { name: "שלח מ" });
    await save();
    await waitFor(() =>
      expect(backend.insert).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_integration_id: "carmen" }),
      ),
    );
  });

  it("does not save an enabled schedule without a phone", async () => {
    backend.senders = [carmen, office];
    renderSettings();
    expect(
      await screen.findByText("בחרו מאיזה טלפון לשלוח"),
    ).toBeInTheDocument();
    await save();
    expect(toastError).toHaveBeenCalledWith("בחרו מאיזה טלפון לשלוח");
    expect(backend.update).not.toHaveBeenCalled();
  });
});
