import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesButton } from "./PulseAlertRulesButton";

// The viewer owns the tenant (carmen_manager_is_owner answers true).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: () => Promise.resolve({ data: true, error: null }) },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));
vi.mock("@/components/pulse/manager-round/OpenFindingsList", () => ({
  OpenFindingsList: () => null,
}));

/** Renders the button over `stored`, opens the dialog and saves; returns the save spy. */
async function openAndSave(stored: unknown) {
  const save = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PulseAlertRulesButton stored={stored} saving={false} save={save} />
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: /ניהול חוקי התראות דופק/ }),
  );
  await userEvent.click(await screen.findByRole("radio", { name: /צוות מלא/ }));
  await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
  return save;
}

describe("PulseAlertRulesButton", () => {
  it("saves the edits merged into the stored rules, keeping unknown keys", async () => {
    const save = await openAndSave({
      cpl_spike_pct: 70,
      collector_logging: true,
      manager: { mode: "observe", escalation_hours: [4, 24] },
    });
    expect(save.mock.calls[0][0]).toMatchObject({
      cpl_spike_pct: 70,
      collector_logging: true,
      manager: { mode: "team", escalation_hours: [4, 24] },
    });
  });

  it("closes the dialog only once the save succeeded", async () => {
    const save = await openAndSave({});
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => save.mock.calls[0][1]());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
