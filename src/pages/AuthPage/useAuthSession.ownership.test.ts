import { auth, session } from "./testUtils/authMocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { authSessionQueryOptions } from "./authSessionQuery";
import { useAuthSession } from "./useAuthSession";

describe("useAuthSession ownership and sign-out", () => {
  it("clears cached credentials after manual ownership and accepts a later session", async () => {
    auth.session = session;
    const { queryClient, wrapper } = createTestQueryHarness();
    const params = new URLSearchParams();
    const navigate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useAuthSession(params, navigate), {
      wrapper,
    });

    await waitFor(() => expect(result.current.checkingSession).toBe(false));
    act(() => {
      result.current.onPasswordSignInStart();
    });
    auth.session = null;

    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });

    expect(
      queryClient.getQueryData(authSessionQueryOptions.queryKey),
    ).toBeNull();
    expect(result.current.checkingSession).toBe(false);

    auth.session = session;
    await act(async () => {
      await auth.listener?.("SIGNED_IN", session);
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryData(authSessionQueryOptions.queryKey)).toEqual(
      session,
    );
  });

  it("clears password-setup state and cache even when setup owns auth events", async () => {
    auth.session = session;
    const { queryClient, wrapper } = createTestQueryHarness();
    await queryClient.fetchQuery(authSessionQueryOptions);
    const params = new URLSearchParams("type=invite");
    const navigate = vi.fn().mockResolvedValue(false);
    const onSignedOut = vi.fn();
    const { result } = renderHook(
      () => useAuthSession(params, navigate, onSignedOut),
      { wrapper },
    );
    auth.session = null;

    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });

    expect(
      queryClient.getQueryData(authSessionQueryOptions.queryKey),
    ).toBeNull();
    expect(result.current.updatePasswordMode).toBe(false);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("lets a manual attempt read a fresh session instead of joining stale bootstrap work", async () => {
    type EmptyResponse = { data: { session: null }; error: null };
    let finishBootstrap: ((response: EmptyResponse) => void) | undefined;
    const startup = new Promise<EmptyResponse>((resolve) => {
      finishBootstrap = resolve;
    });
    auth.getSession.mockReturnValueOnce(startup);
    const { queryClient, wrapper } = createTestQueryHarness();
    const params = new URLSearchParams();
    const navigate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useAuthSession(params, navigate), {
      wrapper,
    });

    act(() => {
      result.current.onPasswordSignInStart();
    });
    auth.session = session;
    const freshSession = queryClient.fetchQuery(authSessionQueryOptions);

    await act(async () => {
      finishBootstrap?.({ data: { session: null }, error: null });
      await freshSession;
    });

    expect(await freshSession).toEqual(session);
    expect(queryClient.getQueryData(authSessionQueryOptions.queryKey)).toEqual(
      session,
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
