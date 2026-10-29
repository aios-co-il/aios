import {
  previousRequest,
  type CapturedRequest,
} from "./BroadcastWizard.test-support";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { BroadcastWizard } from "./BroadcastWizard";

const context = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  fetch: vi.fn<typeof fetch>(),
  previewAudience: vi.fn(async () => ({ total: 1 })),
  launch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.com", "test-key", {
      global: { fetch: (...args) => context.fetch(...args) },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: "broadcast-component",
      },
    }),
  };
});
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: context.tenantId }),
}));
vi.mock("@/hooks/useLeadStatuses", () => ({
  useLeadStatuses: () => ({ statuses: [] }),
}));
vi.mock("@/hooks/useLeadPipelineStages", () => ({
  useLeadPipelineStages: () => ({ activeStages: [] }),
}));
vi.mock("@/hooks/useBroadcasts", () => ({
  useBroadcasts: () => ({
    previewAudience: context.previewAudience,
    launch: context.launch,
  }),
}));
vi.mock("@/hooks/useBroadcastLists", () => ({
  useBroadcastLists: () => ({ lists: { data: [] } }),
}));
vi.mock("@/hooks/useBroadcastDomains", () => ({
  useBroadcastDomains: () => ({ list: { data: [] } }),
}));
vi.mock("@/hooks/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ list: { data: [] } }),
}));
vi.mock("@/components/forms/WaProviderConnectionPicker", () => ({
  WaProviderConnectionPicker: ({
    onChange,
  }: {
    onChange: (id: string) => void;
  }) => (
    <button onClick={() => onChange("integration-1")}>Choose connection</button>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: PropsWithChildren<{
    value: string;
    onValueChange: (value: string) => void;
  }>) => (
    <select
      aria-label="Audience source"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
  SelectItem: ({ value }: PropsWithChildren<{ value: string }>) => (
    <option value={value}>{value}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const initialQueries = [
  ["tenant_integrations", "wa-integrations"],
  ["chat_tags", "chat-tags"],
  ["whatsapp_groups", "wa-groups"],
] as const;

/** Capture the actual component's query cache for disabled-query manual fetches. */
function mountWizard(open = true) {
  let client: QueryClient | undefined;
  /** Expose the actual cache without replacing useQuery or its enabled guards. */
  function Probe() {
    client = useQueryClient();
    return <BroadcastWizard open={open} onOpenChange={vi.fn()} />;
  }
  const view = render(withTestQuery(<Probe />));
  if (!client) {
    throw new Error("Missing test query client");
  }
  return { ...view, client };
}

/** Use real audience controls without reaching the send/launch step. */
function openAudience() {
  fireEvent.click(screen.getByRole("button", { name: "הבא" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose connection" }));
  fireEvent.click(screen.getByRole("button", { name: "הבא" }));
}

describe("BroadcastWizard production tenant query paths", () => {
  const requests: Array<CapturedRequest> = [];
  beforeEach(() => {
    requests.length = 0;
    context.fetch.mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      requests.push({
        url: request.url,
        method: request.method,
        headers: [...request.headers],
        body: await request.text(),
      });
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    });
  });

  for (const tenantId of ["tenant-1", null]) {
    it(`preserves all six query paths and refetch for tenant ${tenantId}`, async () => {
      context.tenantId = tenantId;
      const { client } = mountWizard();
      if (tenantId) {
        await waitFor(() => expect(requests).toHaveLength(3));
      } else {
        expect(requests).toHaveLength(0);
        await act(async () => {
          for (const [, key] of initialQueries) {
            const query = client
              .getQueryCache()
              .find({ queryKey: [key, tenantId] });
            expect(query?.isDisabled()).toBe(true);
            await query?.fetch();
          }
        });
      }
      for (const [table, key] of initialQueries) {
        const request = requests.find((entry) =>
          new URL(entry.url).pathname.endsWith(`/${table}`),
        );
        expect(request).toEqual(await previousRequest(table, tenantId));
        const count = requests.length;
        await act(async () => {
          await client
            .getQueryCache()
            .find({ queryKey: [key, tenantId] })
            ?.fetch();
        });
        expect(requests[count]).toEqual(request);
      }
      openAudience();
      fireEvent.click(
        screen.getByRole("checkbox", { name: "בחירת נמענים ספציפית" }),
      );
      for (const source of ["leads", "clients", "campaigners"] as const) {
        fireEvent.change(
          screen.getAllByRole("combobox", { name: "Audience source" })[0],
          { target: { value: source } },
        );
        await waitFor(() =>
          expect(
            client
              .getQueryCache()
              .findAll({ queryKey: ["broadcast-candidates", tenantId] })
              .some((query) => query.queryKey[2] === source),
          ).toBe(true),
        );
        const query = client
          .getQueryCache()
          .findAll({ queryKey: ["broadcast-candidates", tenantId] })
          .find((entry) => entry.queryKey[2] === source);
        await act(async () => {
          await query?.fetch();
        });
        expect(requests.at(-1)).toEqual(
          await previousRequest(source, tenantId),
        );
        const count = requests.length;
        await act(async () => {
          await query?.fetch();
        });
        expect(requests[count]).toEqual(
          await previousRequest(source, tenantId),
        );
      }
      fireEvent.click(
        screen.getByRole("checkbox", { name: "רק חברי צוות פעילים" }),
      );
      const inactive = client
        .getQueryCache()
        .findAll({
          queryKey: ["broadcast-candidates", tenantId, "campaigners"],
        })
        .find((query) => query.queryKey.at(-1) === false);
      expect(inactive).toBeDefined();
      await act(async () => {
        await inactive?.fetch();
      });
      expect(requests.at(-1)).toEqual(
        await previousRequest("campaigners", tenantId, false),
      );
      expect(context.launch).not.toHaveBeenCalled();
    });
  }

  it("propagates integration, tag and group read failures", async () => {
    context.tenantId = "tenant-1";
    context.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: "read failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );
    const { client } = mountWizard(false);
    for (const [, key] of initialQueries) {
      const query = client
        .getQueryCache()
        .find({ queryKey: [key, context.tenantId] });
      expect(query).toBeDefined();
      await act(async () => {
        await expect(query?.fetch()).rejects.toMatchObject({
          message: "read failed",
        });
      });
    }
  });

  it("does not fetch while the wizard is closed", () => {
    context.tenantId = "tenant-1";
    const { client } = mountWizard(false);
    for (const query of client.getQueryCache().getAll()) {
      expect(query.isDisabled()).toBe(true);
    }
    expect(requests).toHaveLength(0);
  });
});
