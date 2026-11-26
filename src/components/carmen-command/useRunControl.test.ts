import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRunControl } from "./useRunControl";

const inserted: Array<unknown> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  },
}));

describe("useRunControl.stop", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("records nothing and says so before the request has a run id", async () => {
    const { result } = renderHook(() => useRunControl("tenant-a"));

    await expect(result.current.stop()).resolves.toBe(false);
    expect(inserted).toEqual([]);
  });

  it("records the run's stop and says so", async () => {
    const { result } = renderHook(() => useRunControl("tenant-a"));
    const runId = result.current.begin();

    let recorded: boolean | undefined;
    await act(async () => {
      recorded = await result.current.stop();
    });

    expect(recorded).toBe(true);
    expect(inserted).toEqual([{ run_id: runId, tenant_id: "tenant-a" }]);
  });
});
