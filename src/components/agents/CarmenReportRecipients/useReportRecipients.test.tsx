import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { useReportRecipients } from "./useReportRecipients";

const state = vi.hoisted(() => ({
  rpcError: null as { code: string; message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
    }),
    rpc: async () =>
      state.rpcError
        ? { data: null, error: state.rpcError }
        : { data: [], error: null },
  },
}));

function mountHook() {
  const { wrapper } = withTestQuery();
  return renderHook(() => useReportRecipients("tenant-a"), { wrapper });
}

beforeEach(() => {
  state.rpcError = null;
});

describe("useReportRecipients", () => {
  it("marks the viewer as not an owner when an owner-only read is refused", async () => {
    state.rpcError = {
      code: "42501",
      message:
        "carmen_report_staff: only owners of this organization may list its staff",
    };

    const { result } = mountHook();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.notOwner).toBe(true);
  });

  it("reports any other failed read as an error only", async () => {
    state.rpcError = { code: "57014", message: "canceling statement" };

    const { result } = mountHook();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.notOwner).toBe(false);
  });

  it("an owner's reads are neither failed nor refused", async () => {
    const { result } = mountHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.notOwner).toBe(false);
  });
});
