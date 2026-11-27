import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { SupplierInvoiceFileLink } from "./SupplierInvoiceFileLink";

const OPEN = "פתיחת קובץ החשבונית";

describe("SupplierInvoiceFileLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  test("a file with a path opens through a fresh signed link", async () => {
    const user = userEvent.setup();
    const tab = fakeTab();
    const open = vi.fn(() => tab);
    vi.stubGlobal("open", open);
    render(
      withTestQuery(
        <SupplierInvoiceFileLink
          invoice={{ file_path: "tenant/supplier/1.pdf", file_url: null }}
        />,
      ),
    );

    await user.click(screen.getByRole("button", { name: OPEN }));

    await waitFor(() =>
      expect(tab.location.replace).toHaveBeenCalledWith(
        "https://signed.example/invoice",
      ),
    );
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(mocks.bucket).toHaveBeenCalledWith("supplier-invoices");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      "tenant/supplier/1.pdf",
      60,
    );
  });

  test("a browser that blocked the tab still gets the signed link", async () => {
    const user = userEvent.setup();
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(
      withTestQuery(
        <SupplierInvoiceFileLink
          invoice={{ file_path: "tenant/supplier/1.pdf", file_url: null }}
        />,
      ),
    );

    await user.click(screen.getByRole("button", { name: OPEN }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://signed.example/invoice",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  test("a link that cannot be signed tells the user and closes the tab", async () => {
    const user = userEvent.setup();
    const tab = fakeTab();
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error("denied"),
    });
    render(
      withTestQuery(
        <SupplierInvoiceFileLink
          invoice={{ file_path: "tenant/supplier/1.pdf", file_url: null }}
        />,
      ),
    );

    await user.click(screen.getByRole("button", { name: OPEN }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "לא הצלחנו לפתוח את קובץ החשבונית",
      ),
    );
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  test("an older row without a path keeps its stored link", () => {
    render(
      withTestQuery(
        <SupplierInvoiceFileLink
          invoice={{
            file_path: null,
            file_url: "https://stored.example/invoice",
          }}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: OPEN }).getAttribute("href")).toBe(
      "https://stored.example/invoice",
    );
  });

  test("a row without a file shows a dash", () => {
    render(
      withTestQuery(
        <SupplierInvoiceFileLink
          invoice={{ file_path: null, file_url: null }}
        />,
      ),
    );

    expect(screen.getByText("-")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

type Signed = {
  data: { signedUrl: string } | null;
  error: Error | null;
};

/** A stand-in for the tab the click opens. */
function fakeTab(): {
  opener: object | null;
  location: { replace: ReturnType<typeof vi.fn> };
  close: ReturnType<typeof vi.fn>;
} {
  return { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
}

const mocks = vi.hoisted(() => {
  const createSignedUrl = vi.fn(async (): Promise<Signed> => ({
    data: { signedUrl: "https://signed.example/invoice" },
    error: null,
  }));
  const bucket = vi.fn(() => ({ createSignedUrl }));

  return { createSignedUrl, bucket, toastError: vi.fn() };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: mocks.bucket } },
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
