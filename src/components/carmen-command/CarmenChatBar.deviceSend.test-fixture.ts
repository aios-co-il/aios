// The browser-step tests' steps on the chat: one typed message, a reset between tests and
// the bubble a text sits in.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { expect, vi } from "vitest";
import type { ScreenContextMetadata } from "@/lib/systemFixContext";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { resetChannel } from "./brainChannelApi.test-fixture";
import { bodies } from "./CarmenChatBar.device.test-fixture";
import { Chat } from "./CarmenChatBar.deviceChat.test-fixture";
import { resetChat } from "./CarmenChatBar.test-fixture";
import { resetBackend } from "./choices/carmenChoiceQueries.test-fixture";
import type { PanelChannel } from "./device/panelStep";

/** What the chat shows while it waits for the panel. */
export const WORKING = "עובדת בדפדפן שלך…";

/** Opens the chat and sends one typed message. */
export async function sendMessage(
  panel: PanelChannel | null,
  tab: ScreenContextMetadata | null = null,
) {
  const user = userEvent.setup();
  const { wrapper } = createTestQueryHarness();
  const { rerender } = render(createElement(Chat, { panel, tab }), {
    wrapper,
  });
  const input = await screen.findByRole("textbox");

  await user.type(input, "מה כתוב בדף?{Enter}");
  await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
  return { user, rerender };
}

/** A fresh backend, chat and request log, with the chat's console noise muted. */
export function resetDeviceChat() {
  localStorage.clear();
  resetBackend();
  resetChannel();
  resetChat();
  bodies.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
}

/** Waits for a text, then the message bubble that holds it. */
export async function answerBubbleWith(text: string): Promise<Element | null> {
  return (await screen.findByText(text)).closest(".cc-msg-bubble");
}

/** The one message bubble that holds a text. */
export function answerBubbleOf(text: string): Element | null {
  return screen.getByText(text).closest(".cc-msg-bubble");
}
