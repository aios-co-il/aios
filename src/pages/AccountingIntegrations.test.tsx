import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, subMonths } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import AccountingIntegrations from "./AccountingIntegrations";
import {
  incomeReads,
  incomeWrites,
  state,
} from "./AccountingIntegrations.test-fixture";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./AccountingIntegrations.test-fixture")).client,
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: state.tenantId }),
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/contexts/AgencyContext", () => ({
  useAgency: () => ({ selectedAgency: null }),
}));
vi.mock("@/hooks/useCrossTenantAgencyIds", () => ({
  useCrossTenantAgencyIds: () => ({ crossTenantAgencyIds: [] }),
}));
vi.mock("@/components/accounting/CashFlowTab", () => ({
  CashFlowTab: () => null,
}));
vi.mock("@/components/accounting/InvoiceIntakeTab", () => ({
  InvoiceIntakeTab: () => null,
}));
vi.mock("@/components/forms/EditClientDialog", () => ({
  EditClientDialog: () => null,
}));

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.failWrite = false;
  state.requests.length = 0;
  state.incomes.length = 0;
  toast.error.mockClear();
  toast.success.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("one-time income tenant readiness", () => {
  it("creates the ready tenant's income and refreshes its caches", async () => {
    const { user } = await fillIncome();
    const readsBeforeSave = incomeReads().length;
    await user.click(screen.getByRole("button", { name: "שמור" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("הכנסה חד פעמית נוספה"),
    );
    expect(incomeWrites()).toHaveLength(1);
    expect(JSON.parse(incomeWrites()[0]?.body ?? "null")).toEqual({
      tenant_id: "tenant-1",
      client_id: "client-1",
      product_name: "Website",
      amount: 125.5,
      payment_month: format(subMonths(new Date(), 1), "yyyy-MM"),
      notes: "Invoice note",
    });
    expect(
      await screen.findByRole("row", { name: /Test client.*Website/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/חד פעמי ב.*: ₪125\.5/)).toBeInTheDocument();
    expect(incomeReads()).toHaveLength(readsBeforeSave + 1);
    const refreshedRead = incomeReads().at(-1);
    const query = new URLSearchParams(refreshedRead?.query);
    expect(query.get("tenant_id")).toBe("eq.tenant-1");
    expect(query.get("payment_month")).toBe(
      `eq.${format(subMonths(new Date(), 1), "yyyy-MM")}`,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("defensively rejects a synthetic direct-page tenant loss without clearing the form", async () => {
    const { user, view } = await fillIncome();
    // Normal route guards block this state; directly rerendering the page tests its mutation boundary.
    state.tenantId = null;
    view.rerender(<AccountingIntegrations />);
    const readsBeforeSave = incomeReads().length;
    await user.click(screen.getByRole("button", { name: "שמור" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("שגיאה בשמירה"),
    );
    expect(incomeWrites()).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(incomeReads()).toHaveLength(readsBeforeSave);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("לדוגמה: בניית אתר")).toHaveValue(
      "Website",
    );
    expect(screen.getByPlaceholderText("0")).toHaveValue(125.5);
    expect(screen.getByPlaceholderText("הערות")).toHaveValue("Invoice note");
  });

  it("preserves failure feedback and the form after a rejected ready-tenant write", async () => {
    state.failWrite = true;
    const { user } = await fillIncome();
    const readsBeforeSave = incomeReads().length;
    await user.click(screen.getByRole("button", { name: "שמור" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("שגיאה בשמירה"),
    );
    expect(incomeWrites()).toHaveLength(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(incomeReads()).toHaveLength(readsBeforeSave);
    expect(
      screen.queryByRole("row", { name: /Test client.*Website/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("לדוגמה: בניית אתר")).toHaveValue(
      "Website",
    );
  });
});

/** Fill the real dialog through its inputs and Radix selectors with an isolated query cache. */
async function fillIncome() {
  const user = userEvent.setup();
  const { wrapper } = createTestQueryHarness();
  const view = render(<AccountingIntegrations />, { wrapper });
  await screen.findByText("Test client");
  await waitFor(() => expect(incomeReads()).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "הכנסה חד פעמית" }));
  const dialog = screen.getByRole("dialog");
  const [clients, months] = within(dialog).getAllByRole("combobox");
  if (!clients || !months) {
    throw new Error("Income selectors missing");
  }
  await user.click(clients);
  await user.click(screen.getByRole("option", { name: "Test client" }));
  await user.type(screen.getByPlaceholderText("לדוגמה: בניית אתר"), "Website");
  await user.type(screen.getByPlaceholderText("0"), "125.5");
  await user.click(months);
  // Match the already displayed month so a successful refresh cannot come from a changed query key.
  const month = screen.getAllByRole("option")[1];
  if (!month) {
    throw new Error("Income month missing");
  }
  await user.click(month);
  await user.type(screen.getByPlaceholderText("הערות"), "Invoice note");
  return { user, view };
}
