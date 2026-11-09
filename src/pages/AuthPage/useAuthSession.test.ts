import { auth, session } from "./testUtils/authMocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { authSessionQueryOptions } from "./authSessionQuery";
import { useAuthSession } from "./useAuthSession";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useAuthSession lifecycle", () => {
  it("updates and clears its session cache from SDK events", async () => {
    const { queryClient, wrapper } = createTestQueryHarness();
    const params = new URLSearchParams();
    const navigate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useAuthSession(params, navigate), {
      wrapper,
    });

    await waitFor(() => expect(result.current.checkingSession).toBe(false));

    await act(async () => {
      await auth.listener?.("SIGNED_IN", session);
    });

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        session.user.id,
        session.access_token,
      ),
    );
    expect(queryClient.getQueryData(authSessionQueryOptions.queryKey)).toEqual(
      session,
    );

    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });

    expect(
      queryClient.getQueryData(authSessionQueryOptions.queryKey),
    ).toBeNull();
    expect(result.current.checkingSession).toBe(false);
  });

  it("releases its subscription and exact fallback timer on unmount", () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { wrapper } = createTestQueryHarness();
    const params = new URLSearchParams("code=waiting");
    const navigate = vi.fn().mockResolvedValue(true);
    const { rerender, unmount } = renderHook(
      () => useAuthSession(params, navigate),
      { wrapper },
    );
    const timerIndex = timeout.mock.calls.findIndex(
      ([, delay]) => delay === 4000,
    );

    expect(timerIndex).toBeGreaterThanOrEqual(0);

    rerender();

    expect(auth.unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(timeout.mock.results[timerIndex].value);
  });
});
