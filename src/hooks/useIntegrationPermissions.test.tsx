import { createClient, type User } from "@supabase/supabase-js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useCurrentUser } from "./useCurrentUser";
import { useIntegrationPermissions } from "./useIntegrationPermissions";

const state = vi.hoisted(() => {
  const requests: Array<Request> = [];
  return {
    fetch: vi.fn<typeof fetch>(),
    success: vi.fn(),
    error: vi.fn(),
    userStatus: 200,
    insertStatus: 201,
    emptyUser: false,
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

const grantor: User = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const integrationId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";

/** Encode only a local SDK session; no token or request reaches a service. */
function testToken() {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: grantor.id,
    exp: 4102444800,
    iat: 1704067200,
  })}.c2lnbmF0dXJl`;
}

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
  const { queryClient, wrapper } = createTestQueryHarness();
  queryClient.setQueryData(["session-ready"], true);
  return renderHook(
    () => ({
      permissions: useIntegrationPermissions(id),
      cachedAuth: useCurrentUser(),
    }),
    { wrapper },
  );
}

/** Select captured permission writes without depending on read-query timing. */
function writes() {
  return state.requests.filter((request) => request.method === "POST");
}

beforeEach(async () => {
  state.userStatus = 200;
  state.insertStatus = 201;
  state.emptyUser = false;
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
      body =
        status !== 200
          ? { msg: "auth unavailable" }
          : state.emptyUser
            ? { user: null }
            : grantor;
    } else {
      expect(path).toBe("/rest/v1/integration_user_permissions");
      if (request.method === "POST") {
        status = state.insertStatus;
        body =
          status === 201
            ? null
            : { code: "42501", message: "modeled insert rejection" };
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
  it("uses the fresh authenticated grantor and preserves the exact request", async () => {
    await authenticate();
    const { result } = mountHook(integrationId);
    await waitFor(() =>
      expect(result.current.permissions.isLoading).toBe(false),
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
    await waitFor(() =>
      expect(
        state.requests.filter(
          (request) =>
            request.method === "GET" &&
            new URL(request.url).pathname ===
              "/rest/v1/integration_user_permissions",
        ),
      ).toHaveLength(2),
    );
  });

  it("rejects without a session before sending a permission write", async () => {
    const { result } = mountHook(integrationId);
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toMatchObject({ name: "AuthSessionMissingError" });
    });
    expect(writes()).toEqual([]);
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("does not substitute cached auth when the fresh user lookup fails", async () => {
    await authenticate();
    const { result } = mountHook(integrationId);
    await waitFor(() =>
      expect(result.current.cachedAuth.userId).toBe(grantor.id),
    );
    state.userStatus = 503;
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toMatchObject({ name: "AuthRetryableFetchError", status: 503 });
    });
    expect(writes()).toEqual([]);
    expect(result.current.cachedAuth.userId).toBe(grantor.id);
    const { data } = await supabase.auth.getSession();
    expect(data.session?.user.id).toBe(grantor.id);
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("rejects a synthetic empty-user HTTP response before insertion", async () => {
    await authenticate();
    state.emptyUser = true;
    const { result } = mountHook(integrationId);
    await act(async () => {
      await expect(
        result.current.permissions.grantPermission.mutateAsync({ userId }),
      ).rejects.toThrow("יש להתחבר מחדש");
    });
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
});
