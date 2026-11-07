import { auth, session } from "./testUtils/authMocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { authSessionQueryOptions } from "./authSessionQuery";
import { useAuthSession } from "./useAuthSession";

type SessionResponse = {
  data: { session: typeof session | null };
  error: null;
};

describe("useAuthSession event races", () => {
  it("keeps a newer sign-in when an older bootstrap resolves empty", async () => {
    const startup = deferred<SessionResponse>();
    auth.getSession.mockReturnValueOnce(startup.promise);
    const { queryClient, wrapper } = createTestQueryHarness();
    const params = new URLSearchParams("code=oauth");
    const navigate = vi.fn().mockResolvedValue(true);
    renderHook(() => useAuthSession(params, navigate), { wrapper });

    await act(async () => {
      await auth.listener?.("SIGNED_IN", session);
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));

    await act(async () => {
      startup.resolve({ data: { session: null }, error: null });
      await startup.promise;
    });

    expect(queryClient.getQueryData(authSessionQueryOptions.queryKey)).toEqual(
      session,
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      session.user.id,
      session.access_token,
    );
  });

  it("keeps sign-out authoritative over a pending restored session", async () => {
    const startup = deferred<SessionResponse>();
    auth.getSession.mockReturnValueOnce(startup.promise);
    const { queryClient, wrapper } = createTestQueryHarness();
    const params = new URLSearchParams();
    const navigate = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useAuthSession(params, navigate), {
      wrapper,
    });

    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });
    await act(async () => {
      startup.resolve({ data: { session }, error: null });
      await startup.promise;
    });

    expect(
      queryClient.getQueryData(authSessionQueryOptions.queryKey),
    ).toBeNull();
    expect(result.current.checkingSession).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves SDK routing to an explicit password attempt", async () => {
    const { wrapper } = createTestQueryHarness();
    const params = new URLSearchParams();
    const navigate = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useAuthSession(params, navigate), {
      wrapper,
    });

    await waitFor(() => expect(result.current.checkingSession).toBe(false));

    act(() => result.current.onPasswordSignInStart());
    await act(async () => {
      await auth.listener?.("SIGNED_IN", session);
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});

/** Control bootstrap completion without timers or real SDK requests. */
function deferred<T>() {
  let complete: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });

  /** Resolve the request after the competing SDK event has completed. */
  function resolve(value: T) {
    complete(value);
  }

  return { promise, resolve };
}
