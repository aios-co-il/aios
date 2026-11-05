import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { ImportAnalyticsDialog } from "./ImportAnalyticsDialog";

const mocks = vi.hoisted(() => ({
  date: "",
  inserts: [] as Array<{ started_at: string }>,
}));

vi.mock("papaparse", () => ({
  default: {
    parse: (
      _file: File,
      options: {
        complete: (result: { data: Array<Record<string, string>> }) => void;
      },
    ) => options.complete({ data: [{ date: mocks.date, sessions: "1" }] }),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        match: async () => ({
          data:
            table === "clients"
              ? []
              : [
                  {
                    id: "tracking",
                    client_id: "",
                    website_domain: "imported.data",
                  },
                ],
        }),
      }),
      insert: async (row: { started_at: string }) => {
        mocks.inserts.push(row);
        return { error: null };
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  mocks.inserts.length = 0;
  vi.restoreAllMocks();
});

describe("ImportAnalyticsDialog date interpretation", () => {
  it.each([
    ["2026-06-07", "2026-06-07"],
    ["07/06/2026", "2026-06-07"],
    ["07/06/26", "2026-06-07"],
    ["2026-02-31", "2026-03-03"],
    ["not a date", null],
  ])("retains existing handling of %s", async (date, expected) => {
    mocks.date = date;
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(withTestQuery(<ImportAnalyticsDialog tenantId="tenant" />));
    fireEvent.click(screen.getByRole("button", { name: "ייבוא מ-GA" }));
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing upload");
    }
    fireEvent.change(input, {
      target: {
        files: [
          new File(["date,sessions"], "report.csv", { type: "text/csv" }),
        ],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "ייבא 1 רשומות" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "ייבא 1 רשומות" }));
    await waitFor(() =>
      expect(
        screen.getByText(expected ? "יובאו 1 רשומות" : "יובאו 0 רשומות"),
      ).toBeVisible(),
    );
    expect(mocks.inserts.map((row) => row.started_at.slice(0, 10))).toEqual(
      expected ? [expected] : [],
    );
  });
});
