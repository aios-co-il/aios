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

const { removeFiles } = vi.hoisted(() => ({ removeFiles: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

vi.mock(
  "@/components/clients/updateAttachments/clientUpdateAttachments",
  () => ({ removeClientUpdateAttachmentFiles: removeFiles }),
);

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

  test("removes the entry's files before the entry", async () => {
    const order: Array<string> = [];
    removeFiles.mockImplementation(async () => {
      order.push("files");
    });
    select.mockImplementation(async () => {
      order.push("row");
      return { data: [{ id: "u1" }], error: null };
    });

    await deleteClientUpdate("u1", ["t/c/u1/a.pdf"]);

    expect(removeFiles).toHaveBeenCalledWith(["t/c/u1/a.pdf"]);
    expect(order).toEqual(["files", "row"]);
  });

  test("keeps the entry when its files could not be removed", async () => {
    removeFiles.mockRejectedValue(new Error("denied"));

    await expect(deleteClientUpdate("u1", ["t/c/u1/a.pdf"])).rejects.toThrow(
      "denied",
    );
    expect(from).not.toHaveBeenCalled();
  });
});
