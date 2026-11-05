import { cloneElement } from "react";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import Chat from "./Chat";

const mocks = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  finishConversion: undefined as (() => void) | undefined,
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({
    tenantId: mocks.tenantId,
    tenant: mocks.tenantId ? { id: mocks.tenantId } : null,
  }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/hooks/useUserAgencies", () => ({
  useUserAgencies: () => ({ userAgencyIds: [], isLoading: false }),
}));
vi.mock("@/contexts/AgencyContext", () => ({
  useAgency: () => ({ selectedAgency: null }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useChatConnections", () => ({
  useChatConnections: () => ({ data: [] }),
}));
vi.mock("@/components/chat/ConvertContactDialog", () => ({
  ConvertContactDialog: ({
    onSuccess,
  }: {
    onSuccess: (id: string, type: "group", tenantId: string) => void;
  }) => (
    <>
      <button
        onClick={() => {
          mocks.finishConversion = () =>
            onSuccess("new-group", "group", "tenant-1");
        }}
      >
        Start conversion
      </button>
      <button onClick={() => mocks.finishConversion?.()}>
        Complete conversion
      </button>
    </>
  ),
}));
vi.mock("@/components/chat/ChatMessageList", () => ({
  default: ({
    contactId,
    contactType,
  }: {
    contactId: string;
    contactType: string;
  }) => (
    <div data-testid="thread">
      {contactType}:{contactId}
    </div>
  ),
}));
vi.mock("@/components/chat/ChatInput", () => ({ default: () => null }));
vi.mock("@/components/chat/AgentSessionsPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/chat/ManyChatControls", () => ({
  ManyChatControls: () => null,
}));
vi.mock("@/components/chat/GreenAPIControls", () => ({
  GreenAPIControls: () => null,
}));
vi.mock("@/components/chat/ChatProviderIndicator", () => ({
  ChatProviderIndicator: () => null,
}));
vi.mock("@/components/chat/LinkContactDialog", () => ({
  LinkContactDialog: () => null,
}));
vi.mock("@/components/chat/LinkPhoneDialog", () => ({
  LinkPhoneDialog: () => null,
}));
vi.mock("@/components/chat/LinkCampaignerDialog", () => ({
  LinkCampaignerDialog: () => null,
}));
vi.mock("@/components/chat/ChangeAgencyDialog", () => ({
  ChangeAgencyDialog: () => null,
}));
vi.mock("@/components/forms/EditClientDialog", () => ({
  EditClientDialog: () => null,
}));
vi.mock("@/components/forms/EditLeadDialog", () => ({
  EditLeadDialog: () => null,
}));
vi.mock("@/components/chat/ChatTagsManager", () => ({
  ChatTagsManager: () => null,
}));
vi.mock("@/components/chat/ChatTagSelector", () => ({
  ChatTagSelector: () => null,
  ContactTagBadges: () => null,
}));
vi.mock("@/components/chat/ChatMultiSelectToolbar", () => ({
  ChatMultiSelectToolbar: () => null,
}));
vi.mock("@/components/chat/ChatConnectionSelector", () => ({
  ChatConnectionSelector: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        or: () => query,
        not: () => query,
        gte: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: { data: never[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
        single: async () => ({
          data: {
            id: "new-group",
            group_name: "Converted group",
            group_chat_id: "123@g.us",
          },
          error: null,
        }),
      };
      return query;
    },
    rpc: async () => ({
      data: [
        {
          contact_id: "unknown-1",
          contact_type: "unknown",
          name: "Unknown sender",
          phone: "123@g.us",
        },
      ],
      error: null,
    }),
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

describe("Chat conversion selection", () => {
  beforeEach(() => {
    mocks.tenantId = "tenant-1";
    mocks.finishConversion = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens the returned group thread on desktop after converting an unknown contact", async () => {
    render(
      withTestQuery(
        <MemoryRouter>
          <Chat />
        </MemoryRouter>,
      ),
    );
    fireEvent.click(await screen.findByText("Unknown sender"));
    expect(await screen.findByTestId("thread")).toHaveTextContent(
      "unknown:unknown-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Start conversion" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete conversion" }),
    );

    expect(await screen.findByTestId("thread")).toHaveTextContent(
      "group:new-group",
    );
  });

  it.each(["tenant-2", null])(
    "does not invalidate or select the old tenant's conversion after switching to %s",
    async (nextTenant) => {
      const page = () => (
        <MemoryRouter>
          <Chat />
        </MemoryRouter>
      );
      const wrapped = withTestQuery(page());
      const view = render(wrapped);
      fireEvent.click(await screen.findByText("Unknown sender"));
      expect(await screen.findByTestId("thread")).toHaveTextContent(
        "unknown:unknown-1",
      );

      fireEvent.click(screen.getByRole("button", { name: "Start conversion" }));
      mocks.tenantId = nextTenant;
      view.rerender(cloneElement(wrapped, undefined, page()));
      const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
      // Linking retains the callback captured before the tenant changed.
      fireEvent.click(
        screen.getByRole("button", { name: "Complete conversion" }),
      );

      expect(invalidate).not.toHaveBeenCalled();
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "unknown:unknown-1",
      );
    },
  );
});
