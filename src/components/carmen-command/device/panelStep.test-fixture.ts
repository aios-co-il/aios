import { vi } from "vitest";
import type { PanelChannel } from "./panelStep";

export const ACTION_ID = "4f0c2a8e-1b2c-4d3e-8f90-123456789abc";
export const NEXT_ACTION_ID = "5a1d3b9f-2c3d-4e4f-9a01-23456789abcd";

/** A panel channel that records what the chat posts and lets a test deliver results. */
export function fakePanel(
  tools: PanelChannel["tools"] = ["browser_read_page"],
) {
  const listeners = new Set<(actionId: string) => void>();
  const panel = {
    tools,
    postAction: vi.fn<(actionId: string) => void>(),
    postCancel: vi.fn<(actionId: string) => void>(),
    onResult: vi.fn((listener: (actionId: string) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  } satisfies PanelChannel;

  /** The panel reports a completed step. */
  function deliverResult(actionId: string) {
    listeners.forEach((listener) => listener(actionId));
  }

  return { panel, deliverResult, listeners };
}
