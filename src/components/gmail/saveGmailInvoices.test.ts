import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  insert: vi.fn(),
  removeFile: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({ insert: mocks.insert }),
  },
}));

vi.mock("@/components/forms/supplierInvoiceFiles", () => ({
  removeSupplierInvoiceFile: mocks.removeFile,
}));

import {
  saveGmailInvoices,
  type GmailInvoiceToSave,
} from "./saveGmailInvoices";

const TENANT = "tenant-1";

function invoice(partId: string): GmailInvoiceToSave {
  return {
    messageId: "m1",
    partId,
    supplierId: "supplier-1",
    invoiceName: `חשבונית ${partId}`,
    invoiceAmount: 100,
    invoiceDate: "2026-11-20",
    invoiceMonth: "2026-11",
    fileName: `${partId}.pdf`,
    aiExtracted: true,
    notes: "מקור: a@b.co | נושא: חשבונית",
  };
}

describe("saveGmailInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.removeFile.mockResolvedValue(undefined);
  });

  test("files are stored for the saved rows only, then each invoice gets its path", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        results: [{ messageId: "m1", partId: "1", filePath: "tenant-1/a.pdf" }],
      },
      error: null,
    });

    const saved = await saveGmailInvoices(TENANT, [invoice("1")]);

    expect(mocks.invoke).toHaveBeenCalledWith("process-invoice-emails", {
      body: {
        action: "store",
        tenantId: TENANT,
        files: [{ messageId: "m1", partId: "1" }],
      },
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      tenant_id: TENANT,
      supplier_id: "supplier-1",
      invoice_name: "חשבונית 1",
      invoice_amount: 100,
      invoice_date: "2026-11-20",
      invoice_month: "2026-11",
      file_path: "tenant-1/a.pdf",
      file_name: "1.pdf",
      ai_extracted: true,
      notes: "מקור: a@b.co | נושא: חשבונית",
    });
    expect(saved).toEqual(["m1:1"]);
  });

  test("a row whose file was not stored is not saved", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        results: [
          {
            messageId: "m1",
            partId: "1",
            error: "The file could not be stored",
          },
          { messageId: "m1", partId: "2", filePath: "tenant-1/b.pdf" },
        ],
      },
      error: null,
    });

    const saved = await saveGmailInvoices(TENANT, [invoice("1"), invoice("2")]);

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["m1:2"]);
  });

  test("a row that could not be written loses its stored file", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        results: [{ messageId: "m1", partId: "1", filePath: "tenant-1/a.pdf" }],
      },
      error: null,
    });
    mocks.insert.mockResolvedValue({ error: { message: "denied" } });

    const saved = await saveGmailInvoices(TENANT, [invoice("1")]);

    expect(mocks.removeFile).toHaveBeenCalledWith("tenant-1/a.pdf");
    expect(saved).toEqual([]);
  });

  test("a failed store call saves nothing", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("offline") });

    await expect(saveGmailInvoices(TENANT, [invoice("1")])).rejects.toThrow(
      "offline",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
