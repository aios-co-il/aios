import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useSavePronunciation } from "./useSavePronunciation";

const state = vi.hoisted(() => ({
  upserts: [] as Array<{ row: unknown; options: unknown }>,
  error: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: async (row: unknown, options: unknown) => {
        state.upserts.push({ row, options });
        return { error: state.error };
      },
    }),
  },
}));

function mountHook(tenantId: string | null) {
  const { wrapper } = createTestQueryHarness();
  return renderHook(() => useSavePronunciation(tenantId), { wrapper });
}

beforeEach(() => {
  state.upserts = [];
  state.error = null;
});

describe("useSavePronunciation", () => {
  it("saves the correction for the org, replacing the same term", async () => {
    const { result } = mountHook("tenant-a");

    const reply = await result.current(" AIOS ", "אֵיי-אַיי-או-אֶס");

    expect(state.upserts).toEqual([
      {
        row: {
          tenant_id: "tenant-a",
          term: "AIOS",
          spoken: "אֵיי-אַיי-או-אֶס",
        },
        options: { onConflict: "tenant_id,term_key" },
      },
    ]);
    expect(reply).toContain("נשמר");
  });

  it("tells Carmen when the save failed instead of throwing", async () => {
    state.error = { message: "denied" };
    const { result } = mountHook("tenant-a");

    expect(await result.current("AIOS", "אֵיי")).toContain("לא הצלחתי");
  });

  it("saves nothing without a term or a pronunciation", async () => {
    const { result } = mountHook("tenant-a");

    expect(await result.current("", "אֵיי")).toContain("לא נשמר");
    expect(state.upserts).toEqual([]);
  });
});
