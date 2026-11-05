import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { AddressGenderSettings } from "./AddressGenderSettings";

const backend = vi.hoisted(() => ({
  gender: null as string | null,
  update: vi.fn(),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-david" }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () =>
          Promise.resolve({ data: { gender: backend.gender }, error: null }),
        update: (row: unknown) => {
          backend.update(row);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return query;
    },
  },
}));

beforeEach(() => {
  backend.gender = null;
  backend.update.mockReset();
});

describe("AddressGenderSettings", () => {
  it("shows the plural when no gender is set", async () => {
    render(withTestQuery(<AddressGenderSettings />));
    await waitFor(() =>
      expect(screen.getByLabelText("לשון רבים (ברירת מחדל)")).toBeChecked(),
    );
  });

  it("saves the chosen gender to the user's own profile", async () => {
    render(withTestQuery(<AddressGenderSettings />));
    fireEvent.click(await screen.findByLabelText("לשון זכר"));
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith({ gender: "male" }),
    );
  });

  it("clears the gender when the plural is picked", async () => {
    backend.gender = "female";
    render(withTestQuery(<AddressGenderSettings />));
    await waitFor(() =>
      expect(screen.getByLabelText("לשון נקבה")).toBeChecked(),
    );
    fireEvent.click(screen.getByLabelText("לשון רבים (ברירת מחדל)"));
    await waitFor(() =>
      expect(backend.update).toHaveBeenCalledWith({ gender: null }),
    );
  });
});
