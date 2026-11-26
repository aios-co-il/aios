import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { ClientUpdateAttachmentPicker } from "./ClientUpdateAttachmentPicker";

/** The picker with its files held in state, as the composer holds them. */
function Harness() {
  const [files, setFiles] = useState<Array<File>>([]);
  return <ClientUpdateAttachmentPicker files={files} onChange={setFiles} />;
}

describe("ClientUpdateAttachmentPicker", () => {
  test("lists accepted files and explains each refusal in Hebrew", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(withTestQuery(<Harness />));

    await user.upload(screen.getByLabelText("בחירת קבצים לצירוף"), [
      new File(["x"], "חזית.png", { type: "image/png" }),
      new File(["x"], "script.svg", { type: "image/svg+xml" }),
    ]);

    expect(screen.getByText("חזית.png")).toBeTruthy();
    expect(screen.queryByText("script.svg")).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'לא ניתן לצרף את "script.svg": אפשר לצרף תמונות, PDF, קובצי Word, Excel ו-PowerPoint, טקסט ו-CSV',
    );
  });

  test("a picked file can be removed before sending", async () => {
    const user = userEvent.setup();
    render(withTestQuery(<Harness />));

    await user.upload(
      screen.getByLabelText("בחירת קבצים לצירוף"),
      new File(["%PDF"], "הצעה.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "הסר את הצעה.pdf" }));

    expect(screen.queryByText("הצעה.pdf")).toBeNull();
  });
});
