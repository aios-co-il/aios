import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reportSender } from "@/test/reportSenderFixture";
import { withTestQuery } from "@/test/withTestQuery";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { ClientReportScheduleSettings } from "./ClientReportScheduleSettings";

const backend = vi.hoisted(() => ({
  senders: [] as ReportSender[],
  schedule: null as Record<string, unknown> | null,
  update: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
        maybeSingle: async () => ({
          data: table === "report_schedules" ? backend.schedule : null,
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

beforeEach(() => {
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
  it("says which phone sends when there is only one", async () => {
    backend.senders = [carmen];
    renderSettings();
    expect(
      await screen.findByText("יישלח מ: הטלפון של כרמן"),
    ).toBeInTheDocument();
  });

  it("saves the line chosen for the schedule", async () => {
    backend.senders = [carmen, david];
    renderSettings();
    const select = await screen.findByRole("combobox", { name: "שלח מ" });
    // The default names the line the worker would use: the saver's own phone.
    expect(select).toHaveTextContent("ברירת המחדל של הארגון (הטלפון של דוד)");
    await userEvent.click(select);
    await userEvent.click(
      await screen.findByRole("option", { name: "הטלפון של כרמן" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "שמור הגדרה" }));
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith(
        expect.objectContaining({
          whatsapp_integration_id: "carmen",
          channels: ["whatsapp"],
        }),
      ),
    );
  });

  it("keeps following the organization default when nothing is chosen", async () => {
    backend.senders = [carmen, david];
    renderSettings();
    await screen.findByRole("combobox", { name: "שלח מ" });
    await userEvent.click(screen.getByRole("button", { name: "שמור הגדרה" }));
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_integration_id: null }),
      ),
    );
  });
});
