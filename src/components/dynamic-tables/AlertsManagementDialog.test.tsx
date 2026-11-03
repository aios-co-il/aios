import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { AlertsManagementDialog } from "./AlertsManagementDialog";

describe("AlertsManagementDialog creation", () => {
  it("rejects a missing tenant before inserting and records the failure", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    backend.tenantId = null;
    await submitAlert();
    await waitFor(() =>
      expect(backend.error).toHaveBeenCalledWith("שגיאה ביצירת התראה"),
    );
    expect(backend.insert).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "Report alert creation failed:",
      "לא נבחר ארגון (tenant)",
    );
    expect(screen.getByRole("button", { name: "הוספה" })).toBeInTheDocument();
  });

  it("preserves the selected tenant and table in a valid alert insert", async () => {
    await submitAlert();
    await waitFor(() =>
      expect(backend.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-1",
          table_id: "table-1",
          name: "עלות לליד",
          metric: "cost_per_lead",
        }),
      ),
    );
    expect(backend.error).not.toHaveBeenCalled();
  });
});

/** Submit through the dialog so validation and mutation error handling run. */
async function submitAlert() {
  const user = userEvent.setup();
  render(
    withTestQuery(
      <AlertsManagementDialog open onOpenChange={vi.fn()} tableId="table-1" />,
    ),
  );
  await user.click(screen.getByRole("button", { name: "הוספת התראה חדשה" }));
  await user.type(
    screen.getByPlaceholderText("לדוגמה: עליה בעלות לליד"),
    "עלות לליד",
  );
  await user.click(screen.getByRole("button", { name: "הוספה" }));
}

const backend = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  insert: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: backend.tenantId }),
}));

vi.mock("sonner", () => ({
  toast: { error: backend.error, success: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: backend.insert,
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
    }),
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  backend.tenantId = "tenant-1";
  backend.error.mockClear();
  backend.insert.mockReset().mockResolvedValue({ error: null });
});
