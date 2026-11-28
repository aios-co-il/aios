import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";

const upsert = vi.fn();

/** A supabase-js query chain: the URL's tenant reads, writes are recorded. */
function table(name: string) {
  const tenant = { id: "org-m", name: "מרקטינג קפטן", slug: "captain" };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: tenant, error: null }),
    upsert: (...args: Array<unknown>) => {
      upsert(name, ...args);
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (name: string) => table(name),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

import { TenantProvider, useTenant } from "./TenantContext";

/** Shows what the provider decided. */
function Probe() {
  const { currentTenantId, isActiveTenantDbSynced } = useTenant();
  return <p>{`${currentTenantId}:${isActiveTenantDbSynced}`}</p>;
}

/** Opens the Command Center at [url] as the browser's address. */
function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  render(
    withTestQuery(
      <MemoryRouter initialEntries={[url]}>
        <TenantProvider>
          <Probe />
        </TenantProvider>
      </MemoryRouter>,
    ),
  );
}

describe("TenantProvider and the website's organization", () => {
  beforeEach(() => {
    upsert.mockClear();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("stores the URL's tenant as the website's organization in a browser tab", async () => {
    renderAt("/t/captain/command-center");

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert).toHaveBeenCalledWith(
      "user_active_tenant",
      expect.objectContaining({ user_id: "u1", tenant_id: "org-m" }),
      { onConflict: "user_id" },
    );
  });

  it("uses the URL's tenant without storing it in the Carmen Android app's web view", async () => {
    renderAt("/t/captain/command-center?carmen_app=1");

    expect(await screen.findByText("org-m:true")).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps the rule for later pages of the app's web view", async () => {
    window.sessionStorage.setItem("carmenAppWebView", "1");

    renderAt("/t/captain/dashboard");

    expect(await screen.findByText("org-m:true")).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });
});
