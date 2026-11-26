import { describe, expect, it } from "vitest";
import { DEVICE_CONTINUATION_TEXT } from "@functions/_shared/carmen/device/contract.ts";
import { deviceToolsToSend, stepRequestFields } from "./deviceRequest";
import { ACTION_ID, fakePanel } from "./panelStep.test-fixture";

describe("deviceToolsToSend", () => {
  it("announces nothing on the site itself or in another frame", () => {
    expect(deviceToolsToSend(null)).toBeUndefined();
  });

  it("announces nothing while the panel names no device tool (tab sharing off)", () => {
    expect(deviceToolsToSend(fakePanel([]).panel)).toBeUndefined();
  });

  it("announces the tools the panel's capabilities named", () => {
    expect(deviceToolsToSend(fakePanel(["browser_read_page"]).panel)).toEqual([
      "browser_read_page",
    ]);
  });
});

describe("stepRequestFields", () => {
  it("is the typed text and nothing else without the panel", () => {
    const fields = stepRequestFields("מה כתוב פה?", undefined);

    expect(fields).toEqual({ command_text: "מה כתוב פה?" });
    expect(stepRequestFields("שלום", { tools: undefined })).toEqual({
      command_text: "שלום",
    });
  });

  it("adds the announced tools beside the typed text with the panel", () => {
    expect(
      stepRequestFields("מה כתוב פה?", { tools: ["browser_read_page"] }),
    ).toEqual({
      command_text: "מה כתוב פה?",
      device: { tools: ["browser_read_page"] },
    });
  });

  it("sends the contract's fixed text and the step's id on a continuation", () => {
    const fields = stepRequestFields("the typed message", {
      tools: ["browser_read_page"],
      continuation: {
        actionId: ACTION_ID,
        runId: "run-1",
        intoReplyKey: "key-1",
      },
    });

    expect(fields).toEqual({
      command_text: DEVICE_CONTINUATION_TEXT,
      device: { tools: ["browser_read_page"] },
      device_continuation: ACTION_ID,
    });
  });

  it("continues without offering a further step once tab sharing is off", () => {
    const fields = stepRequestFields("x", {
      tools: undefined,
      continuation: { actionId: ACTION_ID, runId: "r", intoReplyKey: "k" },
    });

    expect(fields).toEqual({
      command_text: DEVICE_CONTINUATION_TEXT,
      device_continuation: ACTION_ID,
    });
  });
});
