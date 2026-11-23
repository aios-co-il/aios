import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import type { ManagedUser } from "../userListTypes";
import { useAssignToTenant } from "./useAssignToTenant";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/edgeFunctionInvoke", () => ({
  invokeEdgeFunction: mocks.invoke,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const user: ManagedUser = {
  id: "u1",
  email: "yuval@example.com",
  full_name: "Yuval",
  status: "active",
  campaigner_id: "card-A",
  sales_person_id: null,
  roles: ["seo"],
};

const assignment = {
  tenantId: "tenant-b",
  role: "campaigner" as const,
  agencyIds: ["agency-1"],
  clientIds: ["client-1"],
  modulePermissions: ["clients"],
};

/** Mounts the hook with its own query cache. */
function mountHook(onDone = vi.fn()) {
  const { wrapper } = createTestQueryHarness();
  const hook = renderHook(() => useAssignToTenant(user, onDone), { wrapper });
  return { ...hook, onDone };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAssignToTenant", () => {
  it("adds the existing user to the chosen organization without an email", async () => {
    mocks.invoke.mockResolvedValue({ success: true });
    const { result, onDone } = mountHook();

    result.current.mutate(assignment);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.invoke).toHaveBeenCalledWith("invite-user", {
      email: "yuval@example.com",
      fullName: "Yuval",
      ...assignment,
      baseUrl: window.location.origin,
      skipEmail: true,
      updateProfileTeamLinks: true,
    });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("says so when the user is already in that organization", async () => {
    mocks.invoke.mockRejectedValue(new Error("EMAIL_EXISTS_IN_TENANT"));
    const { result, onDone } = mountHook();

    result.current.mutate(assignment);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "המשתמש כבר שייך לארגון הזה",
      ),
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
