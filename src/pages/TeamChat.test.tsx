import { createClient } from "@supabase/supabase-js";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import TeamChat from "./TeamChat";

const state = vi.hoisted<{
  tenantId: string | null;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
}>(() => ({ tenantId: "tenant-1", fetch: vi.fn<typeof fetch>() }));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AgencyContext", () => ({
  useAgency: () => ({ selectedAgency: "all", agencies: [], isLoading: false }),
}));
vi.mock("@/hooks/useCrossTenantAgencyIds", () => ({
  useCrossTenantAgencyIds: () => ({ crossTenantAgencyIds: [] }),
}));
vi.mock("@/components/chat/LinkFileToEntityDialog", () => ({
  LinkFileToEntityDialog: () => null,
}));
vi.mock("@/integrations/supabase/client", () => {
  const supabase = createClient<Database>("https://teamchat.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  });
  const channel = supabase.channel("test-channel");
  vi.spyOn(channel, "subscribe").mockReturnValue(channel);
  vi.spyOn(supabase, "channel").mockReturnValue(channel);
  vi.spyOn(supabase, "removeChannel").mockResolvedValue("ok");
  return { supabase };
});

let queryClient: QueryClient;

/** Observe the real page query for manual refetch while disabled. */
function QueryProbe() {
  queryClient = useQueryClient();
  return null;
}

beforeEach(() => {
  state.fetch.mockReset();
  state.fetch.mockImplementation(
    async () =>
      new Response("[]", { headers: { "content-type": "application/json" } }),
  );
});

afterEach(cleanup);

describe("TeamChat tenant query", () => {
  it.each(["tenant-1", null, ""])(
    "preserves enabled state and SDK requests for %s",
    async (tenantId) => {
      state.tenantId = tenantId;
      render(
        withTestQuery(
          <>
            <QueryProbe />
            <TeamChat />
          </>,
        ),
      );
      const query = queryClient.getQueryCache().find({
        queryKey: ["team-channels", tenantId, "user-1"],
      });
      expect(query).toBeDefined();
      if (!query) {
        throw new Error("Missing team-channels query");
      }
      expect(query.isDisabled()).toBe(!tenantId);
      if (tenantId) {
        await waitFor(() => expect(query.state.status).toBe("success"));
      } else {
        expect(
          state.fetch.mock.calls.some(([input]) =>
            String(input).includes("team_channel_members"),
          ),
        ).toBe(false);
        await act(async () => {
          await query.fetch();
        });
      }
      const calls = state.fetch.mock.calls.filter(([input]) =>
        String(input).includes("/rest/v1/team_channel_members?"),
      );
      expect(calls).toHaveLength(1);
      const [input, init] = calls[0];
      const request = new Request(input, init);
      expect(request.method).toBe("GET");
      expect(await request.text()).toBe("");
      const url = new URL(request.url);
      expect(url.pathname).toBe("/rest/v1/team_channel_members");
      expect([...url.searchParams.entries()]).toEqual([
        ["select", "channel_id"],
        ["user_id", "eq.user-1"],
        ["tenant_id", `eq.${tenantId}`],
      ]);
      expect(query.state.data).toEqual([]);
    },
  );
});
