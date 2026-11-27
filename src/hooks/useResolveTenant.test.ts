import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();

/** A supabase-js query chain answering by table: no active tenant row, one membership. */
function table(name: string) {
  const answer =
    name === "tenant_users"
      ? {
          data: [
            {
              tenant_id: "org-m",
              tenants: { slug: "captain", status: "active" },
            },
          ],
          error: null,
        }
      : { data: null, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(answer),
    maybeSingle: () => Promise.resolve(answer),
    upsert: (...args: Array<unknown>) => {
      upsert(name, ...args);
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (name: string) => table(name) },
}));

import { resolveTenantSlug } from "./useResolveTenant";

describe("resolveTenantSlug", () => {
  beforeEach(() => {
    upsert.mockClear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("stores the first membership as the website's organization in a browser tab", async () => {
    await expect(resolveTenantSlug("u1", 1)).resolves.toBe("captain");

    expect(upsert).toHaveBeenCalledWith(
      "user_active_tenant",
      expect.objectContaining({ user_id: "u1", tenant_id: "org-m" }),
      { onConflict: "user_id" },
    );
  });

  it("never stores it in the Carmen Android app's web view", async () => {
    window.history.replaceState(null, "", "/?carmen_app=1");

    await expect(resolveTenantSlug("u1", 1)).resolves.toBe("captain");

    expect(upsert).not.toHaveBeenCalled();
  });
});
