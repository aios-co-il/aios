import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: Array<string> = [];
  const eq = vi.fn(async (_column: string, id: string) => {
    calls.push(`delete row ${id}`);
    return { error: null as { message: string } | null };
  });
  const upload = vi.fn(async (path: string) => {
    calls.push(`upload ${path}`);
    return { error: null as { message: string } | null };
  });
  const remove = vi.fn(async (paths: Array<string>) => {
    calls.push(`remove ${paths.join(",")}`);
    return { error: null as { message: string } | null };
  });
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://signed.example/invoice" } as {
      signedUrl: string;
    } | null,
    error: null as { message: string } | null,
  }));
  const bucket = vi.fn(() => ({ upload, remove, createSignedUrl }));

  return { calls, eq, upload, remove, createSignedUrl, bucket };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ delete: () => ({ eq: mocks.eq }) }),
    storage: { from: mocks.bucket },
  },
}));

import {
  deleteSupplierInvoice,
  signSupplierInvoiceUrl,
  uploadSupplierInvoiceFile,
} from "./supplierInvoiceFiles";

describe("supplier invoice files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
  });

  test("an upload goes into the tenant's folder and returns its path", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const path = await uploadSupplierInvoiceFile(
      "tenant-1",
      "supplier-1",
      new File(["%PDF"], "חשבונית.pdf", { type: "application/pdf" }),
    );

    expect(path).toBe("tenant-1/supplier-1/1700000000000.pdf");
    expect(mocks.bucket).toHaveBeenCalledWith("supplier-invoices");
    expect(mocks.calls).toEqual([`upload ${path}`]);
  });

  test("a refused upload is an error, not a path", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: "denied" } });

    await expect(
      uploadSupplierInvoiceFile(
        "tenant-1",
        "supplier-1",
        new File([], "a.pdf"),
      ),
    ).rejects.toEqual({ message: "denied" });
  });

  test("a file opens through a one-minute link", async () => {
    const url = await signSupplierInvoiceUrl("tenant-1/supplier-1/1.pdf");

    expect(url).toBe("https://signed.example/invoice");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      "tenant-1/supplier-1/1.pdf",
      60,
    );
  });

  test("a link storage did not sign is an error", async () => {
    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: null });

    await expect(signSupplierInvoiceUrl("tenant-1/x.pdf")).rejects.toThrow(
      "no signed URL",
    );
  });

  test("deleting an invoice removes its row, then its file", async () => {
    await deleteSupplierInvoice({
      id: "invoice-1",
      file_path: "tenant-1/supplier-1/1.pdf",
    });

    expect(mocks.calls).toEqual([
      "delete row invoice-1",
      "remove tenant-1/supplier-1/1.pdf",
    ]);
  });

  test("an invoice whose row was not deleted keeps its file", async () => {
    mocks.eq.mockResolvedValueOnce({ error: { message: "denied" } });

    await expect(
      deleteSupplierInvoice({ id: "invoice-1", file_path: "tenant-1/1.pdf" }),
    ).rejects.toEqual({ message: "denied" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  test("an invoice without a file deletes only its row", async () => {
    await deleteSupplierInvoice({ id: "invoice-1", file_path: null });

    expect(mocks.calls).toEqual(["delete row invoice-1"]);
  });

  test("a file storage did not remove is an error", async () => {
    mocks.remove.mockResolvedValueOnce({ error: { message: "denied" } });

    await expect(
      deleteSupplierInvoice({ id: "invoice-1", file_path: "tenant-1/1.pdf" }),
    ).rejects.toEqual({ message: "denied" });
  });
});
