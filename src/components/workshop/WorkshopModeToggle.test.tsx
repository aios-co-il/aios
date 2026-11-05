import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { WorkshopModeToggle } from "./WorkshopModeToggle";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  stored: { workshop_mode: null as string | null },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {
    maybeSingle: async () => ({ data: { ...mocks.stored }, error: null }),
  };
  for (const method of ["select", "eq"]) {
    chain[method] = () => chain;
  }
  return { supabase: { from: () => chain, rpc: mocks.rpc } };
});

const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("WorkshopModeToggle", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.stored.workshop_mode = null;
  });

  test("a project without a mode shows semi-automatic", async () => {
    render(withTestQuery(<WorkshopModeToggle tenantId="t1" projectId="p1" />));
    await waitFor(() => expect(pressed("חצי אוטומטי")).toBe("true"));
    expect(pressed("אוטומטי")).toBe("false");
  });

  test("the stored mode is shown after a reload", async () => {
    mocks.stored.workshop_mode = "auto";
    render(withTestQuery(<WorkshopModeToggle tenantId="t1" projectId="p1" />));
    await waitFor(() => expect(pressed("אוטומטי")).toBe("true"));
  });

  test("choosing automatic saves it on the project", async () => {
    mocks.rpc.mockResolvedValue({ data: "auto", error: null });
    render(withTestQuery(<WorkshopModeToggle tenantId="t1" projectId="p1" />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "אוטומטי" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "אוטומטי" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("workshop_set_mode", {
        p_item_id: "p1",
        p_mode: "auto",
      }),
    );
    await waitFor(() => expect(pressed("אוטומטי")).toBe("true"));
  });

  test("a failed save keeps the mode as it was", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    render(withTestQuery(<WorkshopModeToggle tenantId="t1" projectId="p1" />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "אוטומטי" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "אוטומטי" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(pressed("חצי אוטומטי")).toBe("true");
  });
});
