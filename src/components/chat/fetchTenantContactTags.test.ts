import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { fetchTenantContactTags } from "./fetchTenantContactTags";

/** Records every filter the query applies and resolves with the given result. */
function fakeDb(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  const db = { from: vi.fn(() => query) };
  return {
    db: db as unknown as SupabaseClient<Database>,
    filters,
    from: db.from,
  };
}

describe("fetchTenantContactTags", () => {
  test("filters by tenant only, so tags a teammate added are included", async () => {
    const rows = [
      { id: "1", tag_id: "t1", user_id: "me" },
      { id: "2", tag_id: "t2", user_id: "teammate" },
    ];
    const { db, filters, from } = fakeDb({ data: rows, error: null });

    await expect(fetchTenantContactTags(db, "tenant-1")).resolves.toEqual(rows);
    expect(from).toHaveBeenCalledWith("chat_contact_tags");
    expect(filters).toEqual([["tenant_id", "tenant-1"]]);
  });

  test("returns no tags and logs when the query fails", async () => {
    const error = { message: "permission denied" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ data: null, error });

    await expect(fetchTenantContactTags(db, "tenant-1")).resolves.toEqual([]);
    expect(log).toHaveBeenCalledWith("Error fetching contact tags:", error);
  });
});
