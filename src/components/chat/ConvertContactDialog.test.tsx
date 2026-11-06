import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import { ConvertContactDialog } from "./ConvertContactDialog";

const mocks = vi.hoisted(() => ({ rpcBody: "" }));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("@/hooks/useTerminology", () => ({
  useTerminology: () => ({ terms: {} }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient<Database>("https://test.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const path = new URL(request.url).pathname;
          let response;
          if (path === "/rest/v1/agencies") {
            response = [{ id: "agency-1", name: "Test agency" }];
          } else if (path === "/rest/v1/tenant_integrations") {
            response = null;
          } else if (path === "/rest/v1/rpc/create_client_with_assignment") {
            mocks.rpcBody = await request.text();
            response = "client-1";
          } else if (path === "/functions/v1/convert-unknown-contact") {
            response = { success: true };
          } else {
            throw new Error(`Unexpected request: ${request.method} ${path}`);
          }
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    }),
  };
});

describe("ConvertContactDialog client RPC arguments", () => {
  beforeEach(() => {
    mocks.rpcBody = "";
  });

  it.each([
    { label: "blank", phone: "", email: "", notes: "", optionalArgs: {} },
    {
      label: "populated",
      phone: "0501234567",
      email: "contact@example.test",
      notes: "Keep this note",
      optionalArgs: {
        p_phone: "0501234567",
        p_email: "contact@example.test",
        p_notes: "Keep this note",
      },
    },
  ])("serializes $label optional fields through the SDK", async (values) => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(
      withTestQuery(
        <ConvertContactDialog
          open
          type="client"
          senderName="New client"
          senderPhone={values.phone}
          onOpenChange={vi.fn()}
          onSuccess={onSuccess}
        />,
      ),
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Test agency" }),
    );
    fireEvent.change(screen.getByLabelText("אימייל"), {
      target: { value: values.email },
    });
    fireEvent.change(screen.getByLabelText("הערות"), {
      target: { value: values.notes },
    });
    await user.click(screen.getByRole("button", { name: "המר" }));
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith("client-1", "client"),
    );
    expect(JSON.parse(mocks.rpcBody)).toEqual({
      p_tenant_id: "tenant-1",
      p_agency_id: "agency-1",
      p_name: "New client",
      ...values.optionalArgs,
    });
  });
});
