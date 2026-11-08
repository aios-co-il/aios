import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import GreenAPISettings from "./GreenAPISettings";
import { saveRequests, state } from "./GreenAPISettings.test-fixture";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/integrations/supabase/client", async () => {
  const { client } = await import("./GreenAPISettings.test-fixture");
  return { supabase: client };
});
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({
    tenantId: state.tenantId,
    isLoading: state.loading,
  }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/forms/ShareIntegrationTenantsDialog", () => ({
  ShareIntegrationTenantsDialog: () => null,
}));
vi.mock("@/components/forms/IntegrationVisibilitySelector", () => ({
  IntegrationVisibilitySelector: () => null,
}));

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.loading = false;
  state.existing = false;
  state.failWrite = false;
  state.requests.length = 0;
});

afterEach(cleanup);

describe("Green API save tenant readiness", () => {
  for (const loading of [false, true]) {
    it(`refuses an unavailable tenant while loading is ${loading}`, async () => {
      state.tenantId = null;
      state.loading = loading;
      await submitSettings();

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith({
          variant: "destructive",
          title: "שגיאה בשמירת הגדרות",
          description: "לא נבחר ארגון (tenant)",
        }),
      );
      expect(saveRequests()).toEqual([]);
      expect(screen.getByRole("button", { name: "שמור ואפשר" })).toBeEnabled();
    });
  }

  for (const existing of [false, true]) {
    it(`preserves the ready-tenant ${existing ? "update" : "insert"} and webhook sequence`, async () => {
      state.existing = existing;
      await submitSettings();
      await waitFor(() => expect(saveRequests()).toHaveLength(2));
      const [write, webhook] = saveRequests();
      const payload = {
        tenant_id: "tenant-1",
        user_id: "user-1",
        integration_type: "green_api",
        api_key: "new-token",
        instance_id: "new-instance",
        is_active: true,
        api_token_last_4: "oken",
        settings: { instance_id: "new-instance" },
      };
      expect(write?.method).toBe(existing ? "PATCH" : "POST");
      expect(write?.path).toBe("/rest/v1/tenant_integrations");
      expect(JSON.parse(write?.body ?? "null")).toEqual(
        existing ? payload : [payload],
      );
      expect(new URLSearchParams(write?.query).get("id")).toBe(
        existing ? "eq.integration-1" : null,
      );
      expect(webhook?.path).toBe("/functions/v1/configure-green-api");
      expect(JSON.parse(webhook?.body ?? "null")).toEqual({
        instanceId: "new-instance",
        apiToken: "new-token",
      });
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "החיבור שלך נשמר בהצלחה" }),
        ),
      );
    });
  }

  it("retains backend save failure feedback without configuring webhooks", async () => {
    state.failWrite = true;
    await submitSettings();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        variant: "destructive",
        title: "שגיאה בשמירת הגדרות",
        description: "save rejected",
      }),
    );
    expect(saveRequests()).toHaveLength(1);
    expect(saveRequests()[0]?.path).toBe("/rest/v1/tenant_integrations");
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "החיבור שלך נשמר בהצלחה" }),
    );
  });
});

/** Exercise the actual form and mutation; only the SDK's HTTP boundary is replaced. */
async function submitSettings() {
  const user = userEvent.setup();
  render(
    withTestQuery(
      <MemoryRouter>
        <GreenAPISettings embedded />
      </MemoryRouter>,
    ),
  );
  if (state.existing) {
    await screen.findByDisplayValue("saved-instance");
  }
  await user.clear(screen.getByLabelText("Instance ID"));
  await user.type(screen.getByLabelText("Instance ID"), "new-instance");
  await user.type(screen.getByLabelText("API Token"), "new-token");
  await user.click(
    screen.getByRole("button", {
      name: state.existing ? "עדכן הגדרות" : "שמור ואפשר",
    }),
  );
}
