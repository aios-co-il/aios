import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: Array<string> = [];
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    calls.push(`insert ${String(row.storage_path)}`);
    return { error: null as { message: string } | null };
  });
  const eq = vi.fn(async (_column: string, id: string) => {
    calls.push(`delete row ${id}`);
    return { error: null };
  });
  const upload = vi.fn(async (path: string) => {
    calls.push(`upload ${path}`);
    return { error: null as { message: string } | null };
  });
  const remove = vi.fn(async (paths: Array<string>) => ({
    data: paths.map((name) => ({ name })),
    error: null as { message: string } | null,
  }));
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://signed.example/file" },
    error: null,
  }));
  return { calls, insert, eq, upload, remove, createSignedUrl };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: mocks.insert,
      delete: () => ({ eq: mocks.eq }),
    }),
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
        createSignedUrl: mocks.createSignedUrl,
      }),
    },
  },
}));

import {
  removeClientUpdateAttachmentFiles,
  signAttachmentOpenUrl,
  uploadClientUpdateAttachments,
} from "./clientUpdateAttachments";

const OWNER = { id: "update-1", tenant_id: "tenant-1", client_id: "client-1" };

describe("uploadClientUpdateAttachments", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
  });

  test("registers each file under the entry's folder before uploading it", async () => {
    const failed = await uploadClientUpdateAttachments(OWNER, [
      new File(["%PDF"], "הצעה.pdf", { type: "application/pdf" }),
    ]);

    expect(failed).toEqual([]);
    expect(mocks.calls).toHaveLength(2);
    expect(mocks.calls[0]).toMatch(
      /^insert tenant-1\/client-1\/update-1\/[0-9a-f-]{36}\.pdf$/,
    );
    expect(mocks.calls[1]).toBe(mocks.calls[0].replace("insert", "upload"));
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        update_id: "update-1",
        file_name: "הצעה.pdf",
        mime_type: "application/pdf",
      }),
    );
  });

  test("a failed upload removes its row and is reported by name", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: "413" } });

    const failed = await uploadClientUpdateAttachments(OWNER, [
      new File(["x"], "big.png", { type: "image/png" }),
      new File(["x"], "ok.png", { type: "image/png" }),
    ]);

    expect(failed).toEqual(["big.png"]);
    expect(mocks.calls[1]).toMatch(/^delete row [0-9a-f-]{36}$/);
    expect(mocks.calls).toHaveLength(4);
  });

  test("a refused row is reported and nothing is uploaded", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { message: "denied" } });

    const failed = await uploadClientUpdateAttachments(OWNER, [
      new File(["x"], "a.png", { type: "image/png" }),
    ]);

    expect(failed).toEqual(["a.png"]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("removeClientUpdateAttachmentFiles", () => {
  test("throws the storage error so the entry is not deleted", async () => {
    const failure = { message: "denied" };
    mocks.remove.mockResolvedValueOnce({ data: [], error: failure });

    await expect(removeClientUpdateAttachmentFiles(["p"])).rejects.toBe(
      failure,
    );
  });

  test("skips storage when the entry has no files", async () => {
    await removeClientUpdateAttachmentFiles([]);

    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("signAttachmentOpenUrl", () => {
  test("a PDF opens inline; any other file downloads under its name", async () => {
    await signAttachmentOpenUrl({
      id: "a",
      file_name: "דוח.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      storage_path: "t/c/u/a.pdf",
    });
    await signAttachmentOpenUrl({
      id: "b",
      file_name: "תקציב.xlsx",
      mime_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: 10,
      storage_path: "t/c/u/b.xlsx",
    });

    expect(mocks.createSignedUrl).toHaveBeenNthCalledWith(
      1,
      "t/c/u/a.pdf",
      60,
      undefined,
    );
    expect(mocks.createSignedUrl).toHaveBeenNthCalledWith(
      2,
      "t/c/u/b.xlsx",
      60,
      { download: "תקציב.xlsx" },
    );
  });
});
