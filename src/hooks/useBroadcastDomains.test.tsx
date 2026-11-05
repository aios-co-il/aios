import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { useBroadcastDomains } from "./useBroadcastDomains";

type CapturedRequest = {
  url: string;
  method: string;
  body: string;
};

const environment = vi.hoisted<{
  tenantId: string | null;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
}>(() => ({ tenantId: "tenant-1", fetch: vi.fn<typeof fetch>() }));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: environment.tenantId }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.com", "test-key", {
      global: { fetch: (...args) => environment.fetch(...args) },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
});

let current: ReturnType<typeof useBroadcastDomains>;
let requests: Array<CapturedRequest>;
let failRequest: (request: CapturedRequest) => boolean;

/** Exercise the production hook inside a real React Query provider. */
function DomainConsumer() {
  current = useBroadcastDomains();
  return <output>{current.list.status}</output>;
}

/** Wait for the enabled query, or verify that null tenants remain disabled. */
async function mountDomains(tenantId: string | null) {
  environment.tenantId = tenantId;
  render(withTestQuery(<DomainConsumer />));
  if (tenantId) {
    await waitFor(() => expect(current.list.isSuccess).toBe(true));
  } else {
    expect(current.list.fetchStatus).toBe("idle");
    expect(requests).toEqual([]);
  }
}

/** Check the request emitted by a production query or mutation. */
function expectTenantRequest(
  method: string,
  body: string,
  tenantId: string | null,
) {
  const request = requests.find(
    (entry) => entry.method === method && entry.body === body,
  );
  expect(request).toBeDefined();
  if (!request) {
    throw new Error("Missing tenant request");
  }
  const url = new URL(request.url);
  expect(url.pathname).toBe("/rest/v1/broadcast_email_domains");
  expect(url.searchParams.get("tenant_id")).toBe(`eq.${tenantId}`);
  return url;
}

beforeEach(() => {
  requests = [];
  failRequest = () => false;
  environment.fetch.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const captured = {
      url: request.url,
      method: request.method,
      body: await request.text(),
    };
    requests.push(captured);
    if (failRequest(captured)) {
      return new Response(
        JSON.stringify({ code: "TEST", message: "query failed" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response("[]", {
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(cleanup);

describe.each(["tenant-1", null])(
  "production domain requests for tenant %s",
  (tenantId) => {
    it("honors enabled and preserves list ordering on manual refetch", async () => {
      await mountDomains(tenantId);
      requests = [];
      await act(async () => {
        await current.list.refetch({ throwOnError: true });
      });
      expect(requests).toHaveLength(1);
      const url = expectTenantRequest("GET", "", tenantId);
      expect(url.searchParams.get("select")).toBe("*");
      expect(url.searchParams.get("order")).toBe(
        "is_default.desc,created_at.asc",
      );
    });

    it("clears defaults then inserts the unchanged creation payload", async () => {
      await mountDomains(tenantId);
      requests = [];
      await act(async () => {
        await current.add.mutateAsync({
          domain: "example.com",
          is_default: true,
        });
      });
      expectTenantRequest(
        "PATCH",
        JSON.stringify({ is_default: false }),
        tenantId,
      );
      expect(requests.find((entry) => entry.method === "POST")?.body).toBe(
        JSON.stringify({
          tenant_id: tenantId,
          created_by: "user-1",
          domain: "example.com",
          from_name: null,
          default_local: "noreply",
          is_default: true,
        }),
      );
      expect(requests[0].method).toBe("PATCH");
      expect(requests[1].method).toBe("POST");
    });

    it("retains the ID and tenant filters on updates", async () => {
      await mountDomains(tenantId);
      requests = [];
      await act(async () => {
        await current.update.mutateAsync({
          id: "domain-1",
          domain: "example.com",
        });
      });
      const url = expectTenantRequest(
        "PATCH",
        JSON.stringify({
          domain: "example.com",
          default_local: "noreply",
          from_name: null,
        }),
        tenantId,
      );
      expect(url.searchParams.get("id")).toBe("eq.domain-1");
      expect(Array.from(url.searchParams.keys())).toEqual(["id", "tenant_id"]);
    });

    it("clears tenant defaults before selecting the requested domain", async () => {
      await mountDomains(tenantId);
      requests = [];
      await act(async () => {
        await current.setDefault.mutateAsync("domain-1");
      });
      expectTenantRequest(
        "PATCH",
        JSON.stringify({ is_default: false }),
        tenantId,
      );
      const selected = requests.find(
        (entry) => entry.body === JSON.stringify({ is_default: true }),
      );
      expect(selected).toBeDefined();
      if (!selected) {
        throw new Error("Missing selected default request");
      }
      expect(new URL(selected.url).searchParams.get("id")).toBe("eq.domain-1");
      expect(requests[0].body).toBe(JSON.stringify({ is_default: false }));
      expect(requests[1].body).toBe(JSON.stringify({ is_default: true }));
    });
  },
);

describe("production domain errors", () => {
  it("returns list errors to callers", async () => {
    await mountDomains(null);
    failRequest = () => true;
    await act(async () => {
      await expect(
        current.list.refetch({ throwOnError: true }),
      ).rejects.toMatchObject({ message: "query failed" });
    });
  });

  it.each(["add", "update", "setDefault"] as const)(
    "returns %s write errors to callers",
    async (operation) => {
      await mountDomains(null);
      failRequest = (request) =>
        request.method === "POST" ||
        request.body !== JSON.stringify({ is_default: false });
      await act(async () => {
        const pending =
          operation === "add"
            ? current.add.mutateAsync({ domain: "example.com" })
            : operation === "update"
              ? current.update.mutateAsync({
                  id: "domain-1",
                  domain: "example.com",
                })
              : current.setDefault.mutateAsync("domain-1");
        await expect(pending).rejects.toMatchObject({
          message: "query failed",
        });
      });
    },
  );
});
