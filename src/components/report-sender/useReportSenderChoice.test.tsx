import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportSender } from "../../../supabase/functions/_shared/report-sender/fixture.ts";
import { withTestQuery } from "@/test/withTestQuery";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";
import { useReportSenderChoice } from "./useReportSenderChoice";

type Backend = {
  senders: ReportSender[];
  tenantDefault: string | null;
  rpc: ReturnType<typeof vi.fn>;
};

const backend = vi.hoisted((): Backend => ({
  senders: [],
  tenantDefault: null,
  rpc: vi.fn(),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-david" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => {
      backend.rpc(name, args);
      return Promise.resolve({ data: backend.senders, error: null });
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () =>
          Promise.resolve({
            data: backend.tenantDefault
              ? { whatsapp_integration_id: backend.tenantDefault }
              : null,
            error: null,
          }),
      };
      return query;
    },
  },
}));

const carmen = reportSender("carmen", { integration_type: "manus_wa" });
const davidGreen = reportSender("david-green", { owner_user_id: "user-david" });
const shared = reportSender("shared", {
  is_shared: true,
  owner_tenant_id: "t2",
});

/** The resolved line id for a tenant, once loaded. */
async function resolvedFor(tenantId: string) {
  const { wrapper } = withTestQuery();
  const hook = renderHook(() => useReportSenderChoice(tenantId), { wrapper });
  await waitFor(() =>
    expect(hook.result.current.pick).not.toEqual({ error: "loading" }),
  );
  return hook;
}

beforeEach(() => {
  backend.senders = [];
  backend.tenantDefault = null;
});

describe("useReportSenderChoice", () => {
  it("sends from Carmen's phone when it is the tenant's only line", async () => {
    backend.senders = [carmen];
    const { result } = await resolvedFor("tenant-dmm");
    expect(backend.rpc).toHaveBeenCalledWith("list_report_whatsapp_senders", {
      p_tenant_id: "tenant-dmm",
    });
    expect(result.current.pick).toMatchObject({
      sender: { id: "carmen" },
      source: "only_sender",
    });
  });

  it("prefers the tenant default, then the sender's own line", async () => {
    backend.senders = [carmen, davidGreen, shared];
    backend.tenantDefault = "shared";
    const withDefault = await resolvedFor("t1");
    expect(withDefault.result.current.pick).toMatchObject({
      sender: { id: "shared" },
      source: "tenant_default",
    });

    backend.tenantDefault = null;
    const withoutDefault = await resolvedFor("t1");
    expect(withoutDefault.result.current.pick).toMatchObject({
      sender: { id: "david-green" },
      source: "own_line",
    });
  });

  it("uses the line picked in the dialog", async () => {
    backend.senders = [carmen, davidGreen];
    const { result } = await resolvedFor("t1");
    act(() => result.current.choose("carmen"));
    expect(result.current.pick).toMatchObject({
      sender: { id: "carmen" },
      source: "requested",
    });
  });

  it("never sends from a shared line nobody chose", async () => {
    backend.senders = [shared];
    const { result } = await resolvedFor("t1");
    expect(result.current.pick).toEqual({ error: "choose_sender" });
    act(() => result.current.choose("shared"));
    expect(result.current.pick).toMatchObject({
      sender: { id: "shared" },
      source: "requested",
    });
  });

  it("refuses a default that can no longer send", async () => {
    backend.senders = [carmen];
    backend.tenantDefault = "off";
    const { result } = await resolvedFor("t1");
    expect(result.current.pick).toEqual({
      error: "sender_not_allowed",
      refused: "tenant_default",
    });
  });

  it("has no line for a tenant without a ready phone", async () => {
    backend.senders = [reportSender("off", { ready: false })];
    const { result } = await resolvedFor("t1");
    expect(result.current.pick).toEqual({ error: "no_report_sender" });
  });
});
