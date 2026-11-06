import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Constants, type Enums } from "@/integrations/supabase/types";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useUserRole } from "./useUserRole";

vi.mock("./useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("@/contexts/ViewAsContext", () => ({
  useViewAs: () => ({ isViewingAs: false, viewAsUserId: null }),
}));

type RoleCase = {
  roles: Array<Enums<"app_role">>;
  membership?: string | null;
  seoTagged?: boolean;
};

/** Exercise the actual hook against preloaded server-state responses. */
function renderRoles({
  roles,
  membership = null,
  seoTagged = false,
}: RoleCase) {
  const { queryClient, wrapper } = createTestQueryHarness();
  queryClient.setQueryData(["session"], {
    user: { id: "user-1", email: "user@example.test" },
  });
  queryClient.setQueryData(["user-roles", "user-1", "tenant-1", false], roles);
  queryClient.setQueryData(
    ["tenant-membership-role", "user-1", "tenant-1"],
    membership,
  );
  queryClient.setQueryData(["user-campaigner-id", "user-1"], "campaigner-1");
  queryClient.setQueryData(
    ["user-campaigner-role-tags", "campaigner-1"],
    seoTagged ? ["SEO"] : [],
  );
  queryClient.setQueryData(["user-sales-person-agency-ids", "user-1"], null);
  return renderHook(useUserRole, { wrapper });
}

afterEach(cleanup);

describe("useUserRole permission membership", () => {
  const names = Constants.public.Enums.app_role;
  const combinations = Array.from({ length: 2 ** names.length }, (_, mask) =>
    names.filter((_, index) => (mask & (1 << index)) !== 0),
  );

  it.each(combinations.map((roles) => ({ roles })))(
    "preserves all role flags for $roles",
    ({ roles }) => {
      const { result } = renderRoles({ roles });
      expect(result.current).toMatchObject({
        roles,
        isOwner: roles.includes("owner"),
        isAgencyOwner: roles.includes("agency_owner"),
        isTeamManager: roles.includes("team_manager"),
        isCampaigner: roles.includes("campaigner"),
        isSalesPerson: roles.includes("sales_person"),
        isSuperAdmin: roles.includes("super_admin"),
        isSeo: roles.includes("seo"),
      });
    },
  );

  it.each(["owner", "agency_owner"])(
    "preserves the tenant %s fallback independently of global roles",
    (membership) => {
      const { result } = renderRoles({ roles: [], membership });
      expect(result.current).toMatchObject({
        isOwner: membership === "owner",
        isAgencyOwner: membership === "agency_owner",
        isSuperAdmin: false,
        isSeo: false,
      });
    },
  );

  it("preserves the SEO campaigner tag fallback", () => {
    const { result } = renderRoles({ roles: [], seoTagged: true });
    expect(result.current).toMatchObject({
      isOwner: false,
      isAgencyOwner: false,
      isSuperAdmin: false,
      isSeo: true,
    });
  });
});
