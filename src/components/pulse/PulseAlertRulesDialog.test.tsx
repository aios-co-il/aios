import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesDialog } from "./PulseAlertRulesDialog";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: null }),
}));
const role = vi.hoisted(() => ({ isOwner: false }));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ ...role, isAgencyOwner: false, isSuperAdmin: false }),
}));

/** Renders the open dialog for an owner or a non-owner; returns its onSave spy. */
function renderDialog(value: unknown, isOwner = false) {
  role.isOwner = isOwner;
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PulseAlertRulesDialog
        open
        onOpenChange={() => {}}
        value={value}
        onSave={onSave}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

describe("PulseAlertRulesDialog manager mode", () => {
  it("lets an owner change Carmen's mode, starting from the stored one", async () => {
    const onSave = renderDialog({ manager: { mode: "david_only" } }, true);
    expect(screen.getByRole("radio", { name: /רק לבעלים/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("radio", { name: /צוות מלא/ }));
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({ mode: "team" });
  });

  it("hides the mode from others, whose save sends no manager change", async () => {
    const onSave = renderDialog({ manager: { mode: "team" } });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({});
  });
});
