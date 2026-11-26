// The run-ai-agent stand-in for the chat's browser-step tests: stream responses as the
// function writes them, and the body of every request the chat sent.
import { vi } from "vitest";
import {
  DEVICE_ACTION_EVENT,
  type DeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";
import { browserTabContextMetadata } from "@functions/_shared/carmen/screen-context.ts";
import type { ScreenContextMetadata } from "@/lib/systemFixContext";
import { ACTION_ID } from "./device/panelStep.test-fixture";

export const CONVERSATION = "11111111-2222-4333-8444-555555555555";
export const PLAN = "אקרא את הדף.";

/** The bodies of the run-ai-agent requests, in order. */
export const bodies: Array<Record<string, unknown>> = [];

/** The channel's answer to a typed message: hand it to the stream, as for Carmen's own brain. */
export const STREAMED_SEND = {
  ok: true,
  status: 200,
  json: {
    ok: true,
    kind: "internal",
    conversation_id: CONVERSATION,
    status: "streaming",
    stream: true,
    accepted_message: "",
  },
};

/** A stream response of these events, as run-ai-agent writes them. */
export function streamOf(...events: Array<object>) {
  const chunks = [
    new TextEncoder().encode(
      events.map((event) => `data: ${JSON.stringify(event)}\n`).join(""),
    ),
  ];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          chunks.length
            ? { done: false, value: chunks.shift() }
            : { done: true, value: undefined },
      }),
    },
  };
}

/** A turn that paused at a step (the read by default), in the stream's two shapes. */
export function pausedTurn(tool: DeviceToolName = "browser_read_page") {
  const step = { action_id: ACTION_ID, tool };

  return streamOf(
    { type: "token", content: PLAN },
    { type: DEVICE_ACTION_EVENT, ...step },
    { type: "done", success: true, output: PLAN, device_action: step },
  );
}

/** Answers each run-ai-agent request with the next response. */
export function serverAnswers(...responses: Array<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return responses.shift() ?? streamOf({ type: "done", success: true });
    }),
  );
}

/** The tab context the panel reports for an address. */
export function tabAt(url: string): ScreenContextMetadata {
  return browserTabContextMetadata(
    { url, title: "Tab" },
    new Date(0).toISOString(),
  );
}
