import { createClient } from "@supabase/supabase-js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import Tenants from "./Tenants";

const state = vi.hoisted<{
  userId: string | undefined;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  toast: ReturnType<typeof vi.fn>;
}>(() => ({ userId: "user-1", fetch: vi.fn<typeof fetch>(), toast: vi.fn() }));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: state.userId }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isSuperAdmin: true, isOwner: false }),
}));
vi.mock("@/hooks/useUserTenants", () => ({
  useUserTenants: () => ({
    userTenants: [
      { id: "tenant-2", name: "Target organization", org_type: "organization" },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: "tenant-1", currentTenant: null }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/components/forms/AddTenantForm", () => ({
  AddTenantForm: () => null,
}));
vi.mock("@/components/forms/EditTenantAgenciesDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/forms/DeleteTenantDialog", () => ({
  DeleteTenantDialog: () => null,
}));
vi.mock("@/components/forms/ConvertTenantTypeDialog", () => ({
  ConvertTenantTypeDialog: () => null,
}));
vi.mock("@/components/forms/EditTenantNameDialog", () => ({
  EditTenantNameDialog: () => null,
}));
vi.mock("@/components/forms/SaveAsTemplateDialog", () => ({
  SaveAsTemplateDialog: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://tenants.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

beforeEach(() => {
  state.toast.mockReset();
  state.fetch.mockReset();
  state.fetch.mockImplementation(
    async () =>
      new Response("[]", { headers: { "content-type": "application/json" } }),
  );
});

afterEach(cleanup);

describe("Tenants access-check requests", () => {
  it.each(["user-1", undefined, ""])(
    "preserves both SDK filters and denied access for user %s",
    async (userId) => {
      const user = userEvent.setup();
      state.userId = userId;
      render(
        withTestQuery(
          <MemoryRouter>
            <Tenants />
          </MemoryRouter>,
        ),
      );
      await user.click(screen.getByText("Target organization"));
      await waitFor(() =>
        expect(state.toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "אין הרשאה" }),
        ),
      );
      expect(state.fetch).toHaveBeenCalledTimes(2);
      const requests = state.fetch.mock.calls.map(
        ([input, init]) => new Request(input, init),
      );
      expect(requests.map((request) => request.method)).toEqual(["GET", "GET"]);
      const urls = requests.map((request) => new URL(request.url));
      expect(urls[0].pathname).toBe("/rest/v1/tenant_users");
      expect([...urls[0].searchParams.entries()]).toEqual([
        ["select", "*"],
        ["tenant_id", "eq.tenant-2"],
        ["user_id", `eq.${userId}`],
      ]);
      expect(urls[1].pathname).toBe("/rest/v1/user_roles");
      expect([...urls[1].searchParams.entries()]).toEqual([
        ["select", "role"],
        ["user_id", `eq.${userId}`],
        ["tenant_id", "eq.tenant-2"],
        ["role", "eq.owner"],
      ]);
      expect(
        await Promise.all(requests.map((request) => request.text())),
      ).toEqual(["", ""]);
    },
  );
});
