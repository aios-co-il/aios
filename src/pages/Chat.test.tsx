import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import Chat from "./Chat";

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({
    tenantId: "tenant-1",
    tenant: { id: "tenant-1" },
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
    onSuccess: (id: string, type: "group") => void;
  }) => (
    <button onClick={() => onSuccess("new-group", "group")}>
      Complete conversion
    </button>
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
  afterEach(cleanup);

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

    fireEvent.click(
      screen.getByRole("button", { name: "Complete conversion" }),
    );

    expect(await screen.findByTestId("thread")).toHaveTextContent(
      "group:new-group",
    );
  });
});
