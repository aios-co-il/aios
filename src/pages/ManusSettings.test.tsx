import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import ManusSettings from "./ManusSettings";
const db = vi.hoisted(() => ({
  update: vi.fn(),
  settings: { api_key: "old", extension: { enabled: true } },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "i", is_active: true, settings: db.settings },
              error: null,
            }),
          }),
        }),
      }),
      update: (payload: unknown) => {
        db.update(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: "t" }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
describe("Manus API key updates", () => {
  it("retains stored extension settings in the database update", async () => {
    const user = userEvent.setup();
    render(withTestQuery(<ManusSettings />));
    await screen.findByRole("button", { name: "עדכן מפתח" });
    await user.type(
      screen.getByPlaceholderText("הכנס את מפתח ה-API של Manus"),
      "new-key",
    );
    await user.click(screen.getByRole("button", { name: "עדכן מפתח" }));
    await waitFor(() =>
      expect(db.update).toHaveBeenCalledWith({
        settings: { api_key: "new-key", extension: { enabled: true } },
        is_active: true,
      }),
    );
  });
});
