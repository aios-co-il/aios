import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";

describe("SaveAsTemplateDialog authentication", () => {
  it("reports a missing user without issuing an invalid insert", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    backend.userId = undefined;
    render(
      <SaveAsTemplateDialog
        open
        onOpenChange={vi.fn()}
        tenant={{ id: "tenant-1", name: "Test" }}
      />,
      { wrapper: withTestQuery().wrapper },
    );
    await userEvent.click(screen.getByRole("button", { name: "שמור טמפלייט" }));
    await waitFor(() =>
      expect(backend.error).toHaveBeenCalledWith(
        expect.stringContaining("נדרשת התחברות"),
      ),
    );
    expect(backend.insert).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "Template save failed:",
      "נדרשת התחברות לשמירת טמפלייט",
    );
  });

  it("attributes a saved template to the signed-in user", async () => {
    const onOpenChange = vi.fn();
    render(
      <SaveAsTemplateDialog
        open
        onOpenChange={onOpenChange}
        tenant={{ id: "tenant-1", name: "Test" }}
      />,
      { wrapper: withTestQuery().wrapper },
    );
    await userEvent.click(screen.getByRole("button", { name: "שמור טמפלייט" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(backend.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: "user-1",
        source_tenant_id: "tenant-1",
      }),
    );
  });
});

const backend = vi.hoisted(() => ({
  userId: "user-1" as string | undefined,
  insert: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: backend.userId }),
}));
vi.mock("sonner", () => ({
  toast: { error: backend.error, success: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: backend.insert }) },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  backend.userId = "user-1";
  backend.error.mockClear();
  backend.insert.mockReset().mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: "template-1" }, error: null }),
    }),
  });
});
