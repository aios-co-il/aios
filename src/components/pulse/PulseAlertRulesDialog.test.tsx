import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesDialog } from "./PulseAlertRulesDialog";

const owner = vi.hoisted(() => ({ value: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: owner.value, error: null }),
  },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));
vi.mock("@/components/pulse/manager-round/OpenFindingsList", () => ({
  OpenFindingsList: () => null,
}));

/** Renders the open dialog for a viewer the database does (or does not) treat as an owner; returns its onSave spy. */
function renderDialog(value: unknown, isOwner = false) {
  owner.value = isOwner;
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
    expect(
      await screen.findByRole("radio", { name: /רק לבעלים/ }),
    ).toHaveAttribute("aria-checked", "true");
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
