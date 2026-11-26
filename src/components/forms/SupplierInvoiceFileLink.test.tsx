import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("./supplierInvoiceFiles", () => ({
  signSupplierInvoiceUrl: mocks.sign,
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { SupplierInvoiceFileLink } from "./SupplierInvoiceFileLink";

const OPEN = "פתיחת קובץ החשבונית";

describe("SupplierInvoiceFileLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("a file with a path opens through a fresh signed link", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    mocks.sign.mockResolvedValue("https://signed.example/invoice");
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
    expect(mocks.sign.mock.calls[0][0]).toBe("tenant/supplier/1.pdf");
  });

  test("a link that cannot be signed tells the user and opens nothing", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sign.mockRejectedValue(new Error("denied"));
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
    expect(open).not.toHaveBeenCalled();
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
