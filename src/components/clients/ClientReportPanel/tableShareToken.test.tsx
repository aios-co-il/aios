import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import {
  type FakeShareRow,
  fakeShareSupabase,
} from "../ClientReportCard/shareRows.test-fixture";
import { useShareToken } from "../ClientReportCard/useShareToken";
import { tableShareSource } from "./tableShareToken";

const holder = vi.hoisted(() => ({
  supabase: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return holder.supabase;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const table = { id: "table-1", name: "פייסבוק", tenant_id: "tenant-1" };

/** Opens the card's share link for the table over these rows. */
function openCard(rows: Array<FakeShareRow>) {
  const fake = fakeShareSupabase(rows);
  holder.supabase = fake.supabase;
  const { wrapper } = createTestQueryHarness();
  const hook = renderHook(
    () => useShareToken(tableShareSource(table, "tenant-1")),
    { wrapper },
  );
  return { ...hook, rows, writes: fake.writes };
}

describe("tableShareSource in the client card", () => {
  it("leaves a link the user turned off inactive and creates nothing on open", async () => {
    const { result, rows, writes } = openCard([
      {
        table_id: "table-1",
        share_token: "old",
        is_active: false,
        created_at: "2026-01-01",
      },
    ]);

    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(result.current.token).toBeNull();
    expect(writes.updates).toEqual([]);
    expect(writes.inserts).toEqual([]);
    expect(rows[0].is_active).toBe(false);
  });

  it("uses an older active link when the newest one is turned off", async () => {
    const { result, writes } = openCard([
      {
        table_id: "table-1",
        share_token: "older-active",
        is_active: true,
        created_at: "2026-01-01",
      },
      {
        table_id: "table-1",
        share_token: "newest-off",
        is_active: false,
        created_at: "2026-02-01",
      },
    ]);

    await waitFor(() => expect(result.current.token).toBe("older-active"));
    expect(result.current.status).toBe("ready");
    expect(writes.updates).toEqual([]);
  });

  it("creates a new link on request, never reactivating the old one", async () => {
    const { result, rows, writes } = openCard([
      {
        table_id: "table-1",
        share_token: "old",
        is_active: false,
        created_at: "2026-01-01",
      },
    ]);
    await waitFor(() => expect(result.current.status).toBe("none"));

    act(() => result.current.create());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(writes.updates).toEqual([]);
    expect(writes.inserts).toHaveLength(1);
    expect(result.current.token).not.toBe("old");
    expect(rows[0].is_active).toBe(false);
  });

  it("reports a failed read as an error, not as no link", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    holder.supabase = {
      from: () => {
        throw new Error("network down");
      },
    };
    const { wrapper } = createTestQueryHarness();
    const failing = renderHook(
      () => useShareToken(tableShareSource(table, "tenant-1")),
      { wrapper },
    );

    await waitFor(() => expect(failing.result.current.status).toBe("failed"));
    expect(error).toHaveBeenCalledWith(
      "Failed to read the share link of report table table-1",
      expect.any(Error),
    );
  });
});
