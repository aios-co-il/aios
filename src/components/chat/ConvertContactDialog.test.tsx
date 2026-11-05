import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { withTestQuery } from "@/test/withTestQuery";
import { ConvertContactDialog } from "./ConvertContactDialog";

const mocks = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  insert: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: mocks.tenantId }),
}));
vi.mock("@/hooks/useTerminology", () => ({
  useTerminology: () => ({ terms: {} }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "agencies") {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }),
        };
      }
      if (table === "tenant_integrations") {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: { integration_type: null },
            error: null,
          }),
        };
        return query;
      }
      return { insert: mocks.insert };
    },
    functions: { invoke: mocks.invoke },
    rpc: mocks.rpc,
  },
}));

describe("ConvertContactDialog creation result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantId = "tenant-1";
    mocks.invoke.mockResolvedValue({ data: null, error: null });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "group-1" }, error: null }),
      }),
    });
  });

  afterEach(cleanup);

  it("passes a newly created group's id to message linking and the caller", async () => {
    const onSuccess = vi.fn();
    render(
      withTestQuery(
        <ConvertContactDialog
          open
          type="group"
          senderName="Support group"
          senderPhone="123@g.us"
          onOpenChange={vi.fn()}
          onSuccess={onSuccess}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "המר" }));

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith("group-1", "group"),
    );
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        group_chat_id: "123@g.us",
      }),
    );
    expect(mocks.invoke).toHaveBeenCalledWith("convert-unknown-contact", {
      body: {
        senderPhone: "123@g.us",
        contactId: "group-1",
        contactType: "group",
        tenantId: "tenant-1",
      },
    });
  });

  it("rejects creation without a tenant before writing or linking messages", async () => {
    mocks.tenantId = null;
    const onSuccess = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      withTestQuery(
        <ConvertContactDialog
          open
          type="group"
          senderName="Support group"
          senderPhone="123@g.us"
          onOpenChange={vi.fn()}
          onSuccess={onSuccess}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "המר" }));

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
