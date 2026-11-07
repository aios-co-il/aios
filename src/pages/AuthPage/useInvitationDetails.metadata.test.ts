import { auth } from "./testUtils/authMocks";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useInvitationDetails } from "./useInvitationDetails";

const invalidMetadata: Array<{ label: string; metadata: Json }> = [
  { label: "null", metadata: null },
  { label: "scalar", metadata: "unexpected" },
  { label: "array", metadata: [] },
  {
    label: "non-string fields",
    metadata: { fullName: 17, tenant_name: { invalid: true } },
  },
];

describe("useInvitationDetails metadata boundary", () => {
  it.each(invalidMetadata)(
    "ignores $label metadata while keeping the typed tenant name",
    async ({ metadata }) => {
      auth.invitation = {
        email: "invite@example.test",
        metadata,
        tenants: { name: "Typed Org" },
      };
      const { wrapper } = createTestQueryHarness();
      const { result } = renderHook(() => useInvitationDetails("invitation"), {
        wrapper,
      });

      await waitFor(() =>
        expect(result.current.inviteBanner).toContain("Typed Org"),
      );

      expect(result.current.email).toBe("invite@example.test");
      expect(result.current.inviteBanner).not.toContain("17");
      expect(result.current.inviteBanner).not.toContain("[object Object]");
      expect(auth.toast).not.toHaveBeenCalled();
    },
  );

  it("uses validated metadata when the joined tenant is unavailable", async () => {
    auth.invitation = {
      email: "invite@example.test",
      metadata: { tenant_name: "Fallback Org", fullName: "Guest" },
      tenants: null,
    };
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(() => useInvitationDetails("invitation"), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.inviteBanner).toContain("Fallback Org"),
    );

    expect(result.current.inviteBanner).toContain("Guest");
    expect(result.current.email).toBe("invite@example.test");
  });
});
