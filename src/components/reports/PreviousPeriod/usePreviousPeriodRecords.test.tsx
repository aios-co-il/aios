import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePreviousPeriodRecords } from "./usePreviousPeriodRecords";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

describe("usePreviousPeriodRecords", () => {
  it("never hands back the last window's rows while a new one loads", async () => {
    const pending: { release?: (value: unknown) => void } = {};
    invoke
      .mockResolvedValueOnce({ data: [{ id: "old", data: {} }], error: null })
      .mockReturnValueOnce(
        new Promise((resolve) => (pending.release = resolve)),
      );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    /** One query client for the whole test. */
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    }
    const { result, rerender } = renderHook(
      ({ dateFilter }) =>
        usePreviousPeriodRecords({
          tableId: "t",
          dateFilter,
          customFrom: null,
          customTo: null,
          enabled: true,
        }),
      { wrapper, initialProps: { dateFilter: "last_7_days" } },
    );
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    rerender({ dateFilter: "last_30_days" });
    expect(result.current.records).toBeUndefined();
    expect(result.current.isPending).toBe(true);

    pending.release?.({ data: [{ id: "new", data: {} }], error: null });
    await waitFor(() => expect(result.current.records?.[0].id).toBe("new"));
  });
});
