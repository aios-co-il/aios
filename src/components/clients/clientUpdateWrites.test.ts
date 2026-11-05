import { beforeEach, describe, expect, test, vi } from "vitest";

const { select, from } = vi.hoisted(() => {
  const select = vi.fn();
  const chain = {
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    select,
  };
  return { select, from: vi.fn(() => chain) };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

import { deleteClientUpdate, editClientUpdate } from "./clientUpdateWrites";

describe("editClientUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves when the row changed", async () => {
    select.mockResolvedValue({ data: [{ id: "u1" }], error: null });

    await expect(editClientUpdate("u1", "טקסט")).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith("client_updates");
    expect(select).toHaveBeenCalledWith("id");
  });

  test("throws when RLS matched no row, so the UI shows an error", async () => {
    select.mockResolvedValue({ data: [], error: null });

    await expect(editClientUpdate("u1", "טקסט")).rejects.toThrow(
      "client_updates edit of u1 changed no row",
    );
  });

  test("throws the write error", async () => {
    const failure = { message: "denied" };
    select.mockResolvedValue({ data: null, error: failure });

    await expect(editClientUpdate("u1", "טקסט")).rejects.toBe(failure);
  });
});

describe("deleteClientUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves when the row was deleted", async () => {
    select.mockResolvedValue({ data: [{ id: "u1" }], error: null });

    await expect(deleteClientUpdate("u1")).resolves.toBeUndefined();
  });

  test("throws when RLS left the row in place", async () => {
    select.mockResolvedValue({ data: [], error: null });

    await expect(deleteClientUpdate("u1")).rejects.toThrow(
      "client_updates delete of u1 changed no row",
    );
  });
});
