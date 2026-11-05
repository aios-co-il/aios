import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentsField, type Attachment } from "./AttachmentsField";

describe("AttachmentsField deletion", () => {
  it("rejects an attachment without a storage path before calling storage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onChange = vi.fn();
    render(
      <AttachmentsField
        attachments={[
          {
            name: "summary",
            type: "text/plain",
            url: "https://example.com/summary",
          },
        ]}
        onChange={onChange}
        entityType="client"
        entityId="client-1"
      />,
    );
    await userEvent.click(screen.getAllByRole("button")[1]);
    expect(backend.remove).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(backend.error).toHaveBeenCalledWith("אין נתיב קובץ למחיקה");
  });

  it.each([false, true])(
    "removes metadata only after successful storage deletion (error=%s)",
    async (fails) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      backend.remove.mockResolvedValue({
        error: fails ? { message: "denied" } : null,
      });
      const onChange = vi.fn();
      const attachments: Array<Attachment> = [
        {
          name: "document",
          type: "text/plain",
          path: "tenant-1/client/client-1/document",
        },
      ];
      render(
        <AttachmentsField
          attachments={attachments}
          onChange={onChange}
          entityType="client"
          entityId="client-1"
        />,
      );
      await userEvent.click(screen.getAllByRole("button")[1]);
      await waitFor(() =>
        expect(backend.remove).toHaveBeenCalledWith([attachments[0].path]),
      );
      if (fails) {
        expect(onChange).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
      }
    },
  );
});

const backend = vi.hoisted(() => ({
  remove:
    vi.fn<
      (paths: Array<string>) => Promise<{ error: { message: string } | null }>
    >(),
  error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ remove: backend.remove }) } },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("sonner", () => ({
  toast: { error: backend.error, success: vi.fn() },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  backend.remove.mockReset();
  backend.error.mockClear();
});
