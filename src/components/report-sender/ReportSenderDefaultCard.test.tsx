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
});
