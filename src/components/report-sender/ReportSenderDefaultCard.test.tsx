import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reportSender } from "@/test/reportSenderFixture";
import { withTestQuery } from "@/test/withTestQuery";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { ReportSenderDefaultCard } from "./ReportSenderDefaultCard";

const backend = vi.hoisted(() => ({
  senders: [] as ReportSender[],
  tenantDefault: null as string | null,
  setDefault: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "set_report_whatsapp_sender") {
        backend.setDefault(args);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: backend.senders, error: null });
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () =>
          Promise.resolve({
            data: { whatsapp_integration_id: backend.tenantDefault },
            error: null,
          }),
      };
      return query;
    },
  },
}));

const owner = { caller_can_manage: true };
const carmen = (extra: Partial<ReportSender> = {}) =>
  reportSender("carmen", { integration_type: "manus_wa", ...extra });
const david = (extra: Partial<ReportSender> = {}) =>
  reportSender("david", { owner_name: "דוד", ...extra });

function renderCard() {
  const { wrapper } = withTestQuery();
  return render(<ReportSenderDefaultCard tenantId="t1" />, { wrapper });
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
  backend.senders = [];
  backend.tenantDefault = null;
});

describe("ReportSenderDefaultCard", () => {
  it("shows the only phone (a Manus-only tenant)", async () => {
    backend.senders = [carmen(owner)];
    renderCard();
    expect(
      await screen.findByText("דוחות נשלחים מ: הטלפון של כרמן"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says the default covers new sends and schedules that follow it", async () => {
    backend.senders = [carmen(owner)];
    renderCard();
    expect(
      await screen.findByText("טלפון ברירת המחדל לשליחת דוחות"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/תזמונים שנבחר להם טלפון משלהם ממשיכים לשלוח ממנו/),
    ).toBeInTheDocument();
  });

  it("lets an owner make a line another organization shared the default", async () => {
    // A shared line is never used on its own, so the only line is a choice.
    backend.senders = [
      carmen({ ...owner, is_shared: true, owner_tenant_name: "AIOS" }),
    ];
    renderCard();
    const select = await screen.findByRole("combobox", { name: "שלח דוחות מ" });
    expect(select).toHaveTextContent("בלי טלפון קבוע");
    await userEvent.click(select);
    await userEvent.click(
      await screen.findByRole("option", {
        name: "הטלפון של כרמן (משותף מארגון אחר: AIOS)",
      }),
    );
    await waitFor(() =>
      expect(backend.setDefault).toHaveBeenCalledWith({
        p_tenant_id: "t1",
        p_integration_id: "carmen",
      }),
    );
  });

  it("shows members that a lone shared line is chosen per send", async () => {
    backend.senders = [carmen({ is_shared: true })];
    renderCard();
    expect(
      await screen.findByText(/אין טלפון קבוע לדוחות/),
    ).toBeInTheDocument();
  });

  it("says there is no phone to send from", async () => {
    renderCard();
    expect(
      await screen.findByText(/אין טלפון וואטסאפ מחובר לשליחת דוחות/),
    ).toBeInTheDocument();
  });

  it("shows members the line in use without a choice", async () => {
    backend.senders = [carmen(), david()];
    backend.tenantDefault = "david";
    renderCard();
    expect(
      await screen.findByText("דוחות נשלחים מ: הטלפון של דוד"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("lets an owner choose the organization's report phone", async () => {
    backend.senders = [carmen(owner), david(owner)];
    renderCard();
    const select = await screen.findByRole("combobox", { name: "שלח דוחות מ" });
    expect(select).toHaveTextContent("בלי טלפון קבוע");
    await userEvent.click(select);
    await userEvent.click(
      await screen.findByRole("option", { name: "הטלפון של כרמן" }),
    );
    await waitFor(() =>
      expect(backend.setDefault).toHaveBeenCalledWith({
        p_tenant_id: "t1",
        p_integration_id: "carmen",
      }),
    );
  });

  it("tells members a stale default fails until an owner replaces it", async () => {
    // The default line was switched off or unshared: the list no longer
    // returns it, and no other line takes its place.
    backend.senders = [carmen()];
    backend.tenantDefault = "off";
    renderCard();
    expect(
      await screen.findByText(/בעלי הארגון צריכים לבחור ברירת מחדל חדשה/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/דוחות נשלחים מ/)).not.toBeInTheDocument();
  });

  it("asks owners to choose a new default for a stale one", async () => {
    backend.senders = [carmen(owner)];
    backend.tenantDefault = "off";
    renderCard();
    const select = await screen.findByRole("combobox", { name: "שלח דוחות מ" });
    expect(select).toHaveTextContent("הטלפון שנבחר כבר לא זמין");
    expect(screen.getByText(/בחרו ברירת מחדל חדשה/)).toBeInTheDocument();
  });
});
