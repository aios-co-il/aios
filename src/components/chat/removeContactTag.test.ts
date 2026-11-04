import { describe, expect, test, vi } from "vitest";
import { removeContactTag, TAG_REMOVE_REFUSED } from "./removeContactTag";

/** Records every filter the delete applies and resolves with the given result. */
function fakeDb(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    delete: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    select: () => Promise.resolve(result),
  };
  const from = vi.fn(() => query);
  return { db: { from } as never, filters };
}

describe("removeContactTag", () => {
  test("removes the tag for the tenant, whoever added it", async () => {
    const { db, filters } = fakeDb({ data: [{ id: "1" }], error: null });
    await removeContactTag(db, "tenant-1", "tag-1", { type: "lead", id: "l1" });
    expect(filters).toEqual([
      ["tenant_id", "tenant-1"],
      ["tag_id", "tag-1"],
      ["lead_id", "l1"],
    ]);
  });

  test("a delete RLS refused (no row removed) is an error, not a silent success", async () => {
    const { db } = fakeDb({ data: [], error: null });
    await expect(
      removeContactTag(db, "tenant-1", "tag-1", { type: "client", id: "c1" }),
    ).rejects.toThrow(TAG_REMOVE_REFUSED);
  });

  test("an unknown contact is matched by its phone", async () => {
    const { db, filters } = fakeDb({ data: [{ id: "1" }], error: null });
    await removeContactTag(db, "tenant-1", "tag-1", {
      type: "unknown",
      id: "",
      senderPhone: "972500000000",
    });
    expect(filters.at(-1)).toEqual(["sender_phone", "972500000000"]);
  });
});
