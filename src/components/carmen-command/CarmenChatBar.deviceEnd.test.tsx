import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_CLAIM_FAILURES } from "@functions/_shared/carmen/device/panel-envelope.ts";
import {
  bodies,
  pausedTurn,
  PLAN,
  serverAnswers,
} from "./CarmenChatBar.device.test-fixture";
import {
  answerBubbleOf,
  answerBubbleWith,
  resetDeviceChat,
  sendMessage,
  WORKING,
} from "./CarmenChatBar.deviceSend.test-fixture";
import { STEP_WAIT_MS } from "./device/panelStep";
import { ACTION_ID, fakePanel } from "./device/panelStep.test-fixture";
import { CLAIM_FAILURE_TEXT, STEP_TIMEOUT_TEXT } from "./device/stepMessages";

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
vi.mock("./brainChannelApi", async () => {
  const { fakeBrainChannelApi } =
    await import("./brainChannelApi.test-fixture");
  const { STREAMED_SEND } = await import("./CarmenChatBar.device.test-fixture");
  return {
    ...fakeBrainChannelApi,
    postChannel: async (body: { action: string }) =>
      body.action === "send"
        ? STREAMED_SEND
        : fakeBrainChannelApi.postChannel(body),
  };
});
vi.mock("@/hooks/useCarmenIdentity", () => ({
  useCarmenIdentity: () => ({ name: "כרמן" }),
}));
vi.mock("@/hooks/useCarmenSkins", () => ({
  useCarmenSkins: () => ({ data: [] }),
}));
vi.mock("@/components/carmen/CarmenAvatar", () => ({
  CarmenAvatar: () => null,
}));

beforeEach(resetDeviceChat);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// A browser step the panel could not take, or never answered: the chat says so in the
// paused answer instead of waiting in silence.
describe("CarmenChatBar when the panel does not run the step", () => {
  it.each(PANEL_CLAIM_FAILURES)(
    "says at once in the answer why the panel could not take the step (%s), and continues nothing",
    async (failure) => {
      const { panel, deliverClaimFailure } = fakePanel();
      serverAnswers(pausedTurn());

      await sendMessage(panel);
      await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
      deliverClaimFailure(ACTION_ID, failure);

      expect(await answerBubbleWith(CLAIM_FAILURE_TEXT[failure])).toBe(
        answerBubbleOf(PLAN),
      );
      expect(screen.queryByText(WORKING)).not.toBeInTheDocument();
      expect(bodies).toHaveLength(1);
      expect(panel.postCancel).not.toHaveBeenCalled();
    },
  );

  it("names the extension when the panel does not answer in time, then continues", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { panel } = fakePanel();
    serverAnswers(pausedTurn());

    await sendMessage(panel);
    await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(STEP_WAIT_MS);

    expect(await answerBubbleWith(STEP_TIMEOUT_TEXT)).toBe(
      answerBubbleOf(PLAN),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ device_continuation: ACTION_ID });
  });
});
