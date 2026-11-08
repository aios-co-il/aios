import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { PersonalApiKeyCard } from "./PersonalApiKeyCard";
const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: async () => ({ data: { user_id: "u" }, error: null }),
        }),
      }),
      delete: () => ({ eq: async () => ({ error: { message: "denied" } }) }),
    }),
  },
}));
describe("personal API key deletion", () => {
  it("shows an error instead of success when deletion fails", async () => {
    const user = userEvent.setup();
    render(withTestQuery(<PersonalApiKeyCard />));
    await user.click(await screen.findByRole("button", { name: "הסר" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "המפתח הוסר" }),
    );
  });
});
