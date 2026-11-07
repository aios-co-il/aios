import { createClient } from "@supabase/supabase-js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useAuthSessionSync } from "./useAuthSessionSync";
import { useCurrentUser } from "./useCurrentUser";
import { useIntegrationPermissions } from "./useIntegrationPermissions";
import {
  grantor,
  integrationId,
  userId,
  testToken,
} from "./useIntegrationPermissions.test-fixture";

const state = vi.hoisted(() => {
  const requests: Array<Request> = [];
  return {
    fetch: vi.fn<typeof fetch>(),
    success: vi.fn(),
    error: vi.fn(),
    userStatus: 200,
    insertStatus: 201,
    granted: false,
    requests,
  };
});

vi.mock("sonner", () => ({ toast: state }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://permissions.test", "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

/** Prime the real SDK before introducing a failing fresh lookup. */
async function authenticate() {
  const { error } = await supabase.auth.setSession({
    access_token: testToken(),
    refresh_token: "synthetic-refresh-token",
  });
  expect(error).toBeNull();
  state.requests = [];
}

/** Keep auth readiness and the query cache stable across mutation updates. */
function mountHook(id: string | undefined) {
  const { wrapper } = createTestQueryHarness();
  return renderHook(
    () => {
      useAuthSessionSync();
      return {
        permissions: useIntegrationPermissions(id),
        cachedAuth: useCurrentUser(),
      };
    },
    { wrapper },
  );
}

/** Select captured permission writes without depending on read-query timing. */
function writes() {
  return state.requests.filter(
    (request) =>
      request.method === "POST" &&
      new URL(request.url).pathname === "/rest/v1/integration_user_permissions",
  );
}

beforeEach(async () => {
  state.userStatus = 200;
  state.insertStatus = 201;
  state.granted = false;
  state.success.mockReset();
  state.error.mockReset();
  state.fetch.mockReset().mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    state.requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path === "/auth/v1/logout") {
      return new Response(null, { status: 204 });
    }
    let status = 200;
    let body: unknown = [];
    if (path === "/auth/v1/user") {
      status = state.userStatus;
      body = status !== 200 ? { msg: "auth unavailable" } : grantor;
    } else if (path === "/rest/v1/profiles") {
      body = [{ id: userId, full_name: "Recipient", email: "test@aios.co.il" }];
    } else {
      expect(path).toBe("/rest/v1/integration_user_permissions");
      if (request.method === "POST") {
        status = state.insertStatus;
        body =
          status === 201
            ? null
            : { code: "42501", message: "modeled insert rejection" };
        state.granted = status === 201;
      } else if (state.granted) {
        body = [
          {
            integration_id: integrationId,
            user_id: userId,
            granted_by: grantor.id,
          },
        ];
      }
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { error } = await supabase.auth.signOut({ scope: "local" });
  expect(error).toBeNull();
  state.requests = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("permission granting user readiness", () => {
  it.each([200, 503])(
    "uses the shared actor and refreshes permissions without a fresh lookup (endpoint status %i)",
    async (userStatus) => {
      await authenticate();
      state.userStatus = userStatus;
      const { result } = mountHook(integrationId);
      await waitFor(() =>
        expect(result.current.cachedAuth.isLoading).toBe(false),
      );
      await act(async () =>
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      );
      expect(writes()).toHaveLength(1);
      expect(await writes()[0]?.json()).toEqual({
        integration_id: integrationId,
        user_id: userId,
        granted_by: grantor.id,
      });
      expect(writes()[0]?.headers.get("authorization")).toBe(
        `Bearer ${testToken()}`,
      );
      expect(state.success).toHaveBeenCalledOnce();
      expect(state.error).not.toHaveBeenCalled();
      expect(
        state.requests.some(
          (request) => new URL(request.url).pathname === "/auth/v1/user",
        ),
      ).toBe(false);
      await waitFor(() =>
        expect(result.current.permissions.permissions).toEqual([
          expect.objectContaining({
            user_id: userId,
            granted_by: grantor.id,
            profiles: expect.objectContaining({ full_name: "Recipient" }),
          }),
        ]),
      );
    },
  );

  it("rejects without a session before sending a permission write", async () => {
    const { result } = mountHook(integrationId);
    await waitFor(() =>
      expect(result.current.cachedAuth.isLoading).toBe(false),
    );
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toThrow("יש להתחבר מחדש");
    });
    expect(writes()).toEqual([]);
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("rejects while the shared session is loading before insertion", async () => {
    await authenticate();
    const getSession = supabase.auth.getSession.bind(supabase.auth);
    let releaseSession: () => void = () => undefined;
    const pendingSession = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    vi.spyOn(supabase.auth, "getSession").mockImplementation(async () => {
      await pendingSession;
      return getSession();
    });
    const { result } = mountHook(integrationId);
    expect(result.current.cachedAuth.isLoading).toBe(true);
    try {
      await act(async () => {
        await expect(
          result.current.permissions.grantPermission.mutateAsync({ userId }),
        ).rejects.toThrow("יש להתחבר מחדש");
      });
    } finally {
      await act(async () => releaseSession());
    }
    expect(writes()).toEqual([]);
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("retains the missing-integration guard before auth lookup or insertion", async () => {
    const { result } = mountHook(undefined);
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toThrow("No integration ID");
    });
    expect(state.requests).toEqual([]);
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("preserves backend rejection and error feedback after successful auth", async () => {
    await authenticate();
    state.insertStatus = 403;
    const { result } = mountHook(integrationId);
    await waitFor(() =>
      expect(result.current.cachedAuth.isLoading).toBe(false),
    );
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toMatchObject({ code: "42501" });
    });
    expect(writes()).toHaveLength(1);
    expect(await writes()[0]?.json()).toMatchObject({ granted_by: grantor.id });
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("stops granting after the shared session observes sign-out", async () => {
    await authenticate();
    const { result } = mountHook(integrationId);
    await waitFor(() =>
      expect(result.current.cachedAuth.userId).toBe(grantor.id),
    );
    await act(async () => {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      expect(error).toBeNull();
    });
    await waitFor(() =>
      expect(result.current.cachedAuth.userId).toBeUndefined(),
    );
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toThrow("יש להתחבר מחדש");
    });
    expect(writes()).toEqual([]);
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });
});
