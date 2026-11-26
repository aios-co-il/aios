import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";

const mocks = vi.hoisted(() => ({
  signPreviews: vi.fn(),
  signOpen: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("./clientUpdateAttachments", () => ({
  signAttachmentPreviews: mocks.signPreviews,
  signAttachmentOpenUrl: mocks.signOpen,
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { ClientUpdateAttachmentList } from "./ClientUpdateAttachmentList";

const PICTURE = {
  id: "pic",
  file_name: "חזית.jpg",
  mime_type: "image/jpeg",
  size_bytes: 2048,
  storage_path: "t/c/u/pic.jpg",
};

const DOCUMENT = {
  id: "doc",
  file_name: "הצעת מחיר.pdf",
  mime_type: "application/pdf",
  size_bytes: 3 * 1024 * 1024,
  storage_path: "t/c/u/doc.pdf",
};

describe("ClientUpdateAttachmentList", () => {
  beforeEach(() => {
    mocks.signPreviews.mockResolvedValue({
      [PICTURE.storage_path]: "https://signed.example/pic",
    });
    mocks.signOpen.mockResolvedValue("https://signed.example/doc");
  });

  test("a picture shows as a thumbnail that opens larger", async () => {
    const user = userEvent.setup();
    render(
      withTestQuery(<ClientUpdateAttachmentList attachments={[PICTURE]} />),
    );

    await user.click(
      await screen.findByRole("button", { name: "הצג את חזית.jpg" }),
    );

    expect(mocks.signPreviews).toHaveBeenCalledWith([PICTURE.storage_path]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByAltText("חזית.jpg")).toHaveLength(2);
  });

  test("a document opens through a fresh signed link", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      withTestQuery(<ClientUpdateAttachmentList attachments={[DOCUMENT]} />),
    );

    await user.click(screen.getByRole("button", { name: /הצעת מחיר\.pdf/ }));

    expect(screen.getByText("3.0 MB")).toBeTruthy();
    expect(mocks.signOpen).toHaveBeenCalledWith(DOCUMENT);
    expect(open).toHaveBeenCalledWith(
      "https://signed.example/doc",
      "_blank",
      "noopener,noreferrer",
    );
    expect(mocks.signPreviews).not.toHaveBeenCalled();
  });

  test("a link that cannot be signed is reported in Hebrew", async () => {
    const user = userEvent.setup();
    mocks.signOpen.mockRejectedValueOnce(new Error("denied"));
    render(
      withTestQuery(<ClientUpdateAttachmentList attachments={[DOCUMENT]} />),
    );

    await user.click(screen.getByRole("button", { name: /הצעת מחיר\.pdf/ }));

    expect(mocks.toastError).toHaveBeenCalledWith(
      'לא הצלחנו לפתוח את "הצעת מחיר.pdf"',
    );
  });

  test("an entry without files renders nothing", () => {
    const { container } = render(
      withTestQuery(<ClientUpdateAttachmentList attachments={[]} />),
    );

    expect(container.innerHTML).toBe("");
  });
});
