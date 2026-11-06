import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Constants, type Enums } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
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
function RoleProbe({ roles, membership = null, seoTagged = false }: RoleCase) {
  const client = useQueryClient();
  useState(() => {
    client.setQueryData(["session"], {
      user: { id: "user-1", email: "user@example.test" },
    });
    client.setQueryData(["user-roles", "user-1", "tenant-1", false], roles);
    client.setQueryData(
      ["tenant-membership-role", "user-1", "tenant-1"],
      membership,
    );
    client.setQueryData(["user-campaigner-id", "user-1"], "campaigner-1");
    client.setQueryData(
      ["user-campaigner-role-tags", "campaigner-1"],
      seoTagged ? ["SEO"] : [],
    );
    client.setQueryData(["user-sales-person-agency-ids", "user-1"], null);
  });
  const result = useUserRole();
  return (
    <output data-testid="roles">
      {JSON.stringify({
        roles: result.roles,
        isOwner: result.isOwner,
        isAgencyOwner: result.isAgencyOwner,
        isTeamManager: result.isTeamManager,
        isCampaigner: result.isCampaigner,
        isSalesPerson: result.isSalesPerson,
        isSuperAdmin: result.isSuperAdmin,
        isSeo: result.isSeo,
      })}
    </output>
  );
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
      render(withTestQuery(<RoleProbe roles={roles} />));
      expect(
        JSON.parse(screen.getByTestId("roles").textContent || "null"),
      ).toEqual({
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
      render(withTestQuery(<RoleProbe roles={[]} membership={membership} />));
      expect(
        JSON.parse(screen.getByTestId("roles").textContent || "null"),
      ).toMatchObject({
        isOwner: membership === "owner",
        isAgencyOwner: membership === "agency_owner",
        isSuperAdmin: false,
        isSeo: false,
      });
    },
  );

  it("preserves the SEO campaigner tag fallback", () => {
    render(withTestQuery(<RoleProbe roles={[]} seoTagged />));
    expect(
      JSON.parse(screen.getByTestId("roles").textContent || "null"),
    ).toMatchObject({
      isOwner: false,
      isAgencyOwner: false,
      isSuperAdmin: false,
      isSeo: true,
    });
  });
});
