import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { PhoneLineCard } from "./PhoneLineCard";

const state = vi.hoisted(() => ({
  role: { isSuperAdmin: false, isLoading: false },
  rows: [] as Array<{ id: string; phone_number: string; active: boolean }>,
  inserts: [] as Array<unknown>,
  deletes: [] as Array<string>,
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => state.role,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: state.rows, error: null }),
        }),
      }),
      insert: async (row: unknown) => {
        state.inserts.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (_column: string, id: string) => {
          state.deletes.push(id);
          return { error: null };
        },
      }),
    }),
  },
}));

function mount() {
  return render(withTestQuery(<PhoneLineCard tenantId="tenant-a" />));
}

beforeEach(() => {
  state.role = { isSuperAdmin: false, isLoading: false };
  state.rows = [{ id: "line-1", phone_number: "03-5550202", active: true }];
  state.inserts = [];
  state.deletes = [];
});

describe("PhoneLineCard", () => {
  it("shows an owner the org's numbers and a note instead of the add form", async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByText("03-5550202")).toBeInTheDocument();
    expect(screen.getByText("רק סופר אדמין מוסיף מספרים.")).toBeInTheDocument();
    expect(screen.queryByLabelText("מספר טלפון")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "הוספה" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "הסרה" }));
    expect(state.deletes).toEqual(["line-1"]);
  });

  it("lets a super admin add a number", async () => {
    state.role = { isSuperAdmin: true, isLoading: false };
    const user = userEvent.setup();
    mount();

    await user.type(await screen.findByLabelText("מספר טלפון"), " 03-5550303 ");
    await user.click(screen.getByRole("button", { name: "הוספה" }));

    expect(state.inserts).toEqual([
      { tenant_id: "tenant-a", phone_number: "03-5550303" },
    ]);
    expect(
      screen.queryByText("רק סופר אדמין מוסיף מספרים."),
    ).not.toBeInTheDocument();
  });
});
