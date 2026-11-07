import { auth } from "./testUtils/authMocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useInvitationDetails } from "./useInvitationDetails";

afterEach(() => vi.restoreAllMocks());

describe("useInvitationDetails query state", () => {
  it("skips missing tokens and preserves an edited email on rerender", async () => {
    const from = vi.spyOn(supabase, "from");
    const { wrapper } = createTestQueryHarness();
    const { result, rerender } = renderHook(
      ({ token }) => useInvitationDetails(token),
      {
        initialProps: { token: null as string | null },
        wrapper,
      },
    );

    expect(from).not.toHaveBeenCalled();

    auth.invitation = {
      email: "invite@example.test",
      metadata: {},
      tenants: { name: "Test Org" },
    };
    rerender({ token: "first" });

    await waitFor(() =>
      expect(result.current.email).toBe("invite@example.test"),
    );

    act(() => result.current.setEmail("edited@example.test"));
    rerender({ token: "first" });

    expect(result.current.email).toBe("edited@example.test");
    expect(result.current.inviteBanner).toContain("Test Org");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("isolates token changes and removes inactive invitation cache entries", async () => {
    const { queryClient, wrapper } = createTestQueryHarness();
    auth.invitation = {
      email: "first@example.test",
      metadata: {},
      tenants: { name: "First Org" },
    };
    const { result, rerender, unmount } = renderHook(
      ({ token }) => useInvitationDetails(token),
      {
        initialProps: { token: "first" },
        wrapper,
      },
    );

    await waitFor(() =>
      expect(result.current.email).toBe("first@example.test"),
    );

    auth.invitation = {
      email: "second@example.test",
      metadata: {},
      tenants: { name: "Second Org" },
    };
    rerender({ token: "second" });

    await waitFor(() =>
      expect(result.current.email).toBe("second@example.test"),
    );
    expect(result.current.inviteBanner).toContain("Second Org");
    expect(
      queryClient.getQueryData(["authPage", "invitation", "second"]),
    ).toEqual(expect.objectContaining({ email: "second@example.test" }));
    await waitFor(() =>
      expect(
        queryClient.getQueryState(["authPage", "invitation", "first"]),
      ).toBeUndefined(),
    );

    unmount();

    await waitFor(() =>
      expect(
        queryClient.getQueryState(["authPage", "invitation", "second"]),
      ).toBeUndefined(),
    );
  });
});
