import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { saveAgencyShares } from "./agencyShares";

/** A fake client that records each write to agency_tenant_access. */
function fakeDb(fail?: "delete" | "insert") {
  const calls: Array<{ op: string; filters?: unknown[]; rows?: unknown }> = [];
  const db = {
    from(table: string) {
      expect(table).toBe("agency_tenant_access");
      return {
        delete() {
          const filters: unknown[] = [];
          const chain = {
            eq(column: string, value: string) {
              filters.push([column, value]);
              return chain;
            },
            in(column: string, values: string[]) {
              filters.push([column, values]);
              calls.push({ op: "delete", filters });
              return Promise.resolve({
                error: fail === "delete" ? new Error("delete failed") : null,
              });
            },
          };
          return chain;
        },
        insert(rows: unknown) {
          calls.push({ op: "insert", rows });
          return Promise.resolve({
            error: fail === "insert" ? new Error("insert failed") : null,
          });
        },
      };
    },
  };
  return { calls, db: db as unknown as SupabaseClient<Database> };
}

const share = { sourceTenantId: "z", accessingTenantId: "x" };

describe("saveAgencyShares", () => {
  it("writes only the shares that changed, so unchanged shares and their re-shares stay", async () => {
    const { calls, db } = fakeDb();
    await saveAgencyShares(db, {
      ...share,
      saved: ["a1", "a2"],
      picked: ["a2", "a3"],
    });
    expect(calls).toEqual([
      {
        op: "delete",
        filters: [
          ["source_tenant_id", "z"],
          ["accessing_tenant_id", "x"],
          ["agency_id", ["a1"]],
        ],
      },
      {
        op: "insert",
        rows: [
          {
            source_tenant_id: "z",
            agency_id: "a3",
            accessing_tenant_id: "x",
            access_level: "read_write",
          },
        ],
      },
    ]);
  });

  it("saving with nothing changed writes nothing", async () => {
    const { calls, db } = fakeDb();
    await saveAgencyShares(db, {
      ...share,
      saved: ["a1", "a2"],
      picked: ["a2", "a1"],
    });
    expect(calls).toEqual([]);
  });

  it("a failed delete or insert is reported", async () => {
    await expect(
      saveAgencyShares(fakeDb("delete").db, {
        ...share,
        saved: ["a1"],
        picked: [],
      }),
    ).rejects.toThrow("delete failed");
    await expect(
      saveAgencyShares(fakeDb("insert").db, {
        ...share,
        saved: [],
        picked: ["a1"],
      }),
    ).rejects.toThrow("insert failed");
  });
});
