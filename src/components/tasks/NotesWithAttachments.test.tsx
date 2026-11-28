import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesWithAttachments } from "./NotesWithAttachments";

describe("NotesWithAttachments upload", () => {
  it("uploads under {tenant}/{task}/, the folder the storage policy reads", async () => {
    const user = userEvent.setup();
    const onAttachmentsChange = vi.fn();
    const { container } = render(
      <NotesWithAttachments
        value=""
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={onAttachmentsChange}
        taskId="task-1"
        variant="files"
      />,
    );

    await user.upload(fileInput(container), report());

    expect(backend.upload).toHaveBeenCalledTimes(1);
    expect(backend.upload.mock.calls[0][0]).toMatch(
      /^tenant-1\/task-1\/\d+_report\.pdf$/,
    );
    expect(onAttachmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({ path: backend.upload.mock.calls[0][0] }),
    ]);
  });

  it("refuses a file before the task is saved instead of filing it under draft/", async () => {
    const user = userEvent.setup();
    const onAttachmentsChange = vi.fn();
    const { container } = render(
      <NotesWithAttachments
        value=""
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={onAttachmentsChange}
        variant="files"
      />,
    );

    await user.upload(fileInput(container), report());

    expect(backend.upload).not.toHaveBeenCalled();
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    expect(backend.error).toHaveBeenCalledWith(
      "שמרו את המשימה לפני צירוף קבצים",
    );
  });
});

/** The component's hidden file picker. */
function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error("file input not rendered");
  }
  return input;
}

/** A small PDF to attach. */
function report(): File {
  return new File(["%PDF"], "report.pdf", { type: "application/pdf" });
}

const backend = vi.hoisted(() => ({
  upload:
    vi.fn<
      (
        path: string,
        file: File,
      ) => Promise<{ error: { message: string } | null }>
    >(),
  error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload: backend.upload }) } },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("sonner", () => ({
  toast: { error: backend.error, success: vi.fn() },
}));

beforeEach(() => {
  backend.upload.mockReset();
  backend.upload.mockResolvedValue({ error: null });
  backend.error.mockClear();
});
