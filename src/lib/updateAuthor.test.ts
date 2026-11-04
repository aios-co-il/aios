import { describe, expect, test, vi } from "vitest";
import {
  UNKNOWN_UPDATE_AUTHOR,
  fetchTenantMemberNames,
  resolveUpdateAuthorName,
} from "./updateAuthor";

/** Resolves the tenant_member_names RPC with the given result. */
function fakeDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { db: { rpc } as never, rpc };
}

describe("fetchTenantMemberNames", () => {
  test("reads the names through tenant_member_names, not profiles", async () => {
    const { db, rpc } = fakeDb({
      data: [
        { user_id: "u1", full_name: " Anna Relin " },
        { user_id: "u2", full_name: "דוד" },
      ],
      error: null,
    });

    const names = await fetchTenantMemberNames(db, "tenant-1");

    expect(rpc).toHaveBeenCalledWith("tenant_member_names", {
      p_tenant_id: "tenant-1",
    });
    expect(names.get("u1")).toBe("Anna Relin");
    expect(names.get("u2")).toBe("דוד");
  });

  test("leaves out members without a name", async () => {
    const { db } = fakeDb({
      data: [
        { user_id: "u1", full_name: null },
        { user_id: "u2", full_name: "  " },
      ],
      error: null,
    });

    const names = await fetchTenantMemberNames(db, "tenant-1");

    expect(names.size).toBe(0);
  });

  test("a refused call is an error", async () => {
    const refusal = { message: "only members of this organization" };
    const { db } = fakeDb({ data: null, error: refusal });

    await expect(fetchTenantMemberNames(db, "tenant-1")).rejects.toBe(refusal);
  });
});

describe("resolveUpdateAuthorName", () => {
  const names = new Map([["u1", "Anna Relin"]]);

  test("shows the writer's name", () => {
    expect(resolveUpdateAuthorName(names, "u1")).toBe("Anna Relin");
  });

  test("falls back to the given fallback, then a generic label", () => {
    expect(resolveUpdateAuthorName(names, "u2", "me@example.com")).toBe(
      "me@example.com",
    );
    expect(resolveUpdateAuthorName(names, "u2")).toBe(UNKNOWN_UPDATE_AUTHOR);
  });

  test("shows the generic label while the names load or without a writer", () => {
    expect(resolveUpdateAuthorName(undefined, "u1")).toBe(
      UNKNOWN_UPDATE_AUTHOR,
    );
    expect(resolveUpdateAuthorName(names, null)).toBe(UNKNOWN_UPDATE_AUTHOR);
  });
});
