import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_BRAIN_ROUTES,
  type BrainRoute,
} from "@/lib/agentChannelRouting";
import { writeResumeChat } from "@/lib/carmenResumeChat";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { channel, resetChannel } from "./brainChannelApi.test-fixture";
import { CarmenChatBar } from "./CarmenChatBar";
import { chat, resetChat } from "./CarmenChatBar.test-fixture";
import {
  DENIED,
  backend,
  gate,
  resetBackend,
  toastError,
} from "./choices/carmenChoiceQueries.test-fixture";
import { useBrainChannel } from "./useBrainChannel";

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./CarmenChatBar.test-fixture")).fakeChatSupabase,
}));
vi.mock("@/hooks/useCurrentUser", async () => ({
  useCurrentUser: (await import("./choices/carmenChoiceQueries.test-fixture"))
    .fakeCurrentUser,
}));
vi.mock("@/contexts/ViewAsContext", async () => ({
  useViewAs: (await import("./choices/carmenChoiceQueries.test-fixture"))
    .fakeViewAs,
}));
vi.mock("sonner", async () => ({
  toast: {
    error: (await import("./choices/carmenChoiceQueries.test-fixture"))
      .toastError,
  },
}));
vi.mock(
  "./brainChannelApi",
  async () =>
    (await import("./brainChannelApi.test-fixture")).fakeBrainChannelApi,
);
vi.mock("@/hooks/useCarmenIdentity", () => ({
  useCarmenIdentity: () => ({ name: "כרמן" }),
}));
vi.mock("@/hooks/useCarmenSkins", () => ({
  useCarmenSkins: () => ({ data: [] }),
}));
vi.mock("@/components/carmen/CarmenAvatar", () => ({
  CarmenAvatar: () => null,
}));

const TENANT = "tenant-a";
const PAST_CHAT = "שיחה קודמת";
const OLD_ANSWER = "תשובה ישנה";
// The user's real brain list never shares ids with the placeholder list.
const [cursor, internal, grok] = FALLBACK_BRAIN_ROUTES.map((route) => ({
  ...route,
  id: `real-${route.slug}`,
}));

/** Every conversation the chat reported being on; null is a new chat. */
const openedConversations: Array<string | null> = [];

/** The session panel: its brain channel, a brain selector and the chat. */
function SessionPanel() {
  const brain = useBrainChannel(TENANT);

  return (
    <>
      <output aria-label="brain">{brain.selected.slug}</output>
      {[internal, grok].map((route) => (
        <button key={route.slug} onClick={() => brain.pickRoute(route)}>
          pick {route.slug}
        </button>
      ))}
      <CarmenChatBar
        tenantId={TENANT}
        brain={brain}
        onFaceState={() => {}}
        audioLevelRef={{ current: 0 }}
        mode="sidecar"
        startFresh
        historyOpen
        onConversationIdChange={(id) => openedConversations.push(id)}
      />
    </>
  );
}

/** The panel was closed on a conversation that runs on this brain. */
function closedOnConversation(route: BrainRoute) {
  pastConversation(route);
  writeResumeChat(TENANT, "conv-1");
}

/** An earlier conversation that runs on this brain. */
function pastConversation(route: BrainRoute) {
  chat.conversations = [
    {
      id: "conv-1",
      title: PAST_CHAT,
      updated_at: new Date().toISOString(),
      status: "idle",
      routing_mode: route.route_type,
      brain_route_id: route.id,
    },
  ];
  chat.messages = [
    { id: "m1", role: "user", content: "שלום", channel: route.slug },
    { id: "m2", role: "assistant", content: OLD_ANSWER, channel: route.slug },
  ];
}

/** Reopens the panel. */
function reopenPanel() {
  const { wrapper } = createTestQueryHarness();
  return render(<SessionPanel />, { wrapper });
}

/** The slug of the brain the selector shows. */
function shownBrain() {
  return screen.getByLabelText("brain").textContent;
}

/** Waits until no write or read is on its way and the screen stopped moving. */
async function settled() {
  await waitFor(() => expect(backend.reads).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetBackend();
  resetChannel();
  resetChat();
  openedConversations.length = 0;
  channel.routes = [cursor, internal, grok];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("CarmenChatBar reopened on the chat it was closed on", () => {
  it("shows the conversation on its own brain when the user's stored pick is another brain", async () => {
    backend.row = { brain_slug: "grok", voice: null };
    closedOnConversation(internal);
    const conversations = gate();
    chat.conversationsGate = conversations.closed;
    reopenPanel();
    await waitFor(() => expect(shownBrain()).toBe("grok"));

    conversations.open();

    expect(await screen.findByText(OLD_ANSWER)).toBeInTheDocument();
    await settled();
    expect(screen.getByText(OLD_ANSWER)).toBeInTheDocument();
    expect(shownBrain()).toBe("internal");
  });

  it("waits for the user's brain list, so the conversation keeps the brain recorded on it", async () => {
    closedOnConversation(grok);
    const brains = gate();
    channel.routesGate = brains.closed;
    reopenPanel();
    await settled();

    expect(channel.posts).toEqual([]);

    brains.open();

    expect(await screen.findByText(OLD_ANSWER)).toBeInTheDocument();
    await settled();
    expect(screen.getByText(OLD_ANSWER)).toBeInTheDocument();
    expect(shownBrain()).toBe("grok");
    expect(channel.posts).toMatchObject([
      { action: "select_route", brain_slug: "grok", conversation_id: "conv-1" },
    ]);
  });

  it.each([
    { outcome: "stored", errors: [], toasts: 0 },
    { outcome: "refused", errors: [DENIED], toasts: 1 },
  ])(
    "moves to a brain picked in the selector, on a new chat, and stays on it when the pick is $outcome",
    async ({ errors, toasts }) => {
      const user = userEvent.setup();
      closedOnConversation(cursor);
      backend.writeErrors = errors;
      const conversations = gate();
      chat.conversationsGate = conversations.closed;
      reopenPanel();
      await waitFor(() => expect(shownBrain()).toBe("internal"));
      conversations.open();
      await screen.findByText(OLD_ANSWER);

      // The brain the session showed when it reopened the conversation.
      await user.click(screen.getByRole("button", { name: "pick internal" }));
      await waitFor(() => expect(backend.upserts).toHaveLength(1));
      await settled();

      expect(shownBrain()).toBe("internal");
      expect(screen.queryByText(OLD_ANSWER)).not.toBeInTheDocument();
      expect(openedConversations.slice(-2)).toEqual(["conv-1", null]);
      expect(toastError).toHaveBeenCalledTimes(toasts);
    },
  );
});

describe("CarmenChatBar after a past chat was opened from the history", () => {
  it("opens a new chat when the user then picks another brain", async () => {
    const user = userEvent.setup();
    pastConversation(internal);
    reopenPanel();
    await waitFor(() => expect(shownBrain()).toBe("internal"));

    await user.click(await screen.findByText(PAST_CHAT));
    await screen.findByText(OLD_ANSWER);
    await user.click(screen.getByRole("button", { name: "pick grok" }));
    await waitFor(() => expect(backend.upserts).toHaveLength(1));
    await settled();

    expect(shownBrain()).toBe("grok");
    expect(openedConversations.slice(-2)).toEqual(["conv-1", null]);
  });
});
