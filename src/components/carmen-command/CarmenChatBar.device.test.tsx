import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_CONTINUATION_TEXT,
  DEVICE_STEP_UNAVAILABLE,
} from "@functions/_shared/carmen/device/contract.ts";
import {
  bodies,
  CONVERSATION,
  pausedTurn,
  PLAN,
  serverAnswers,
  streamOf,
  tabAt,
} from "./CarmenChatBar.device.test-fixture";
import { Chat } from "./CarmenChatBar.deviceChat.test-fixture";
import {
  answerBubbleOf,
  answerBubbleWith,
  resetDeviceChat,
  sendMessage,
  WORKING,
} from "./CarmenChatBar.deviceSend.test-fixture";
import { STEP_UNAVAILABLE_TEXT } from "./device/deviceReply";
import { ACTION_ID, fakePanel } from "./device/panelStep.test-fixture";

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

const PAGE_ANSWER = "בדף כתוב: מחירים.";

beforeEach(resetDeviceChat);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CarmenChatBar outside the extension's panel", () => {
  it("sends no device field and hands no step to anyone", async () => {
    serverAnswers(pausedTurn());

    await sendMessage(null);

    expect(await screen.findByText(PLAN)).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty("device");
    expect(bodies[0]).not.toHaveProperty("device_continuation");
    expect(bodies[0].command_text).toBe("מה כתוב בדף?");
  });

  it("sends no device field while the panel names no device tool", async () => {
    const { panel } = fakePanel([]);
    serverAnswers(pausedTurn());

    await sendMessage(panel);

    expect(await screen.findByText(PLAN)).toBeInTheDocument();
    expect(bodies[0]).not.toHaveProperty("device");
    expect(panel.postAction).not.toHaveBeenCalled();
  });
});

describe("CarmenChatBar in the extension's panel", () => {
  it("runs the step through the panel and continues the run into the same answer", async () => {
    const { panel, deliverResult } = fakePanel();
    serverAnswers(
      pausedTurn(),
      streamOf(
        { type: "token", content: PAGE_ANSWER },
        { type: "done", success: true, output: PAGE_ANSWER },
      ),
    );

    await sendMessage(panel);

    expect(bodies[0]).toMatchObject({
      command_text: "מה כתוב בדף?",
      device: { tools: ["browser_read_page"] },
    });
    await waitFor(() =>
      expect(panel.postAction).toHaveBeenCalledExactlyOnceWith(ACTION_ID),
    );
    expect(screen.getByText(WORKING)).toBeInTheDocument();

    deliverResult(ACTION_ID);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({
      command_text: DEVICE_CONTINUATION_TEXT,
      device_continuation: ACTION_ID,
      device: { tools: ["browser_read_page"] },
      run_id: bodies[0].run_id,
      conversation_id: CONVERSATION,
    });
    expect(bodies[1].reply_key).not.toBe(bodies[0].reply_key);
    expect(await answerBubbleWith(PAGE_ANSWER)).toBe(answerBubbleOf(PLAN));
    expect(screen.queryByText(WORKING)).not.toBeInTheDocument();
  });

  it("continues with the tab the panel shares now, which a navigation may have moved", async () => {
    const { panel, deliverResult } = fakePanel(["browser_navigate"]);
    serverAnswers(pausedTurn("browser_navigate"));

    const { rerender } = await sendMessage(
      panel,
      tabAt("https://shop.example/"),
    );
    await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
    rerender(<Chat panel={panel} tab={tabAt("https://store.example/cart")} />);
    deliverResult(ACTION_ID);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toMatchObject([
      { context_metadata: { url: "https://shop.example/" } },
      { context_metadata: { url: "https://store.example/cart" } },
    ]);
  });

  it("says plainly that it cannot go on when the server refuses the continuation", async () => {
    const { panel, deliverResult } = fakePanel();
    serverAnswers(
      pausedTurn(),
      streamOf({
        type: "done",
        success: false,
        error: DEVICE_STEP_UNAVAILABLE,
      }),
    );

    await sendMessage(panel);
    await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
    deliverResult(ACTION_ID);

    expect(await answerBubbleWith(STEP_UNAVAILABLE_TEXT)).toBe(
      answerBubbleOf(PLAN),
    );
    expect(screen.queryByText(/device_step_unavailable/)).toBeNull();
  });

  it("answers a 409 continuation with the same plain line", async () => {
    const { panel, deliverResult } = fakePanel();
    serverAnswers(pausedTurn(), {
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: DEVICE_STEP_UNAVAILABLE }),
    });

    await sendMessage(panel);
    await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
    deliverResult(ACTION_ID);

    expect(await answerBubbleWith(STEP_UNAVAILABLE_TEXT)).toBe(
      answerBubbleOf(PLAN),
    );
  });

  it("a message typed while the step waits drops its card, then goes out after the continuation", async () => {
    const { panel, deliverResult } = fakePanel();
    serverAnswers(pausedTurn());

    const { user } = await sendMessage(panel);
    await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
    await user.type(screen.getByRole("textbox"), "עזבי{Enter}");

    expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID);
    expect(bodies).toHaveLength(1);
    deliverResult(ACTION_ID);

    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[1]).toMatchObject({ device_continuation: ACTION_ID });
    expect(bodies[2]).toMatchObject({ command_text: "עזבי" });
    expect(bodies[2]).not.toHaveProperty("device_continuation");
    expect(bodies[2].run_id).not.toBe(bodies[0].run_id);
  });

  it("Stop drops the waiting step and continues only for the stop line", async () => {
    const { panel } = fakePanel();
    serverAnswers(
      pausedTurn(),
      streamOf(
        { type: "token", content: "עצרתי." },
        { type: "done", success: true, output: "עצרתי." },
      ),
    );

    const { user } = await sendMessage(panel);
    await waitFor(() => expect(panel.postAction).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "עצירה" }));

    await waitFor(() =>
      expect(panel.postCancel).toHaveBeenCalledExactlyOnceWith(ACTION_ID),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({
      device_continuation: ACTION_ID,
      run_id: bodies[0].run_id,
    });
  });
});
