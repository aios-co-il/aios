import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { NoResultsDaysField } from "./NoResultsDaysField";

/** The clients row the fake database holds, and the writes it received. */
const fake = vi.hoisted(() => ({
  stored: null as number | null,
  updatedRows: 1,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "clients") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { pulse_no_results_days: fake.stored },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_column: string, id: string) => ({
            select: async () => {
              fake.updates.push({ id, patch });
              return {
                data: Array.from({ length: fake.updatedRows }, () => ({ id })),
                error: null,
              };
            },
          }),
        }),
      };
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LABEL = "ימים מלאים בלי לידים או מכירות לפני התראה";

describe("NoResultsDaysField", () => {
  beforeEach(() => {
    fake.stored = null;
    fake.updatedRows = 1;
    fake.updates = [];
  });

  it("shows 7 for a client without its own value", async () => {
    render(withTestQuery(<NoResultsDaysField clientId="client-1" />));
    expect(await screen.findByDisplayValue("7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שמור" })).toBeDisabled();
  });

  it("saves the client's days on the client row", async () => {
    fake.stored = 7;
    const user = userEvent.setup();
    render(withTestQuery(<NoResultsDaysField clientId="client-1" />));
    const input = await screen.findByLabelText(LABEL);
    await waitFor(() => expect(input).toHaveValue(7));
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "שמור" }));
    await waitFor(() => expect(fake.updates).toHaveLength(1));
    expect(fake.updates[0]).toEqual({
      id: "client-1",
      patch: { pulse_no_results_days: 3 },
    });
  });

  it("refuses a value outside 1–30", async () => {
    fake.stored = 7;
    const user = userEvent.setup();
    render(withTestQuery(<NoResultsDaysField clientId="client-1" />));
    const input = await screen.findByLabelText(LABEL);
    await waitFor(() => expect(input).toHaveValue(7));
    for (const value of ["0", "31", "2.5"]) {
      await user.clear(input);
      await user.type(input, value);
      expect(screen.getByRole("button", { name: "שמור" })).toBeDisabled();
    }
    expect(fake.updates).toHaveLength(0);
  });

  it("reports a write that updated no row", async () => {
    const { toast } = await import("sonner");
    fake.stored = 7;
    fake.updatedRows = 0;
    const user = userEvent.setup();
    render(withTestQuery(<NoResultsDaysField clientId="client-1" />));
    const input = await screen.findByLabelText(LABEL);
    await waitFor(() => expect(input).toHaveValue(7));
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: "שמור" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("ההגדרה לא נשמרה"),
      ),
    );
  });
});
