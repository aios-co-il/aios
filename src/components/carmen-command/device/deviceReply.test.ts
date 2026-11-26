import { describe, expect, it } from "vitest";
import {
  DEVICE_ACTION_EVENT,
  DEVICE_STEP_UNAVAILABLE,
} from "@functions/_shared/carmen/device/contract.ts";
import { deviceActionFrom, isStepUnavailable } from "./deviceReply";

const ACTION_ID = "4f0c2a8e-1b2c-4d3e-8f90-123456789abc";
const ACTION = { action_id: ACTION_ID, tool: "browser_read_page" };

describe("deviceActionFrom", () => {
  it("reads the stream's device_action event", () => {
    expect(deviceActionFrom({ type: DEVICE_ACTION_EVENT, ...ACTION })).toEqual(
      ACTION,
    );
  });

  it("reads the stream's done event", () => {
    expect(
      deviceActionFrom({
        type: "done",
        success: true,
        output: "ממתינה לפעולה בדפדפן.",
        device_action: ACTION,
      }),
    ).toEqual(ACTION);
  });

  it("reads the JSON reply", () => {
    expect(
      deviceActionFrom({ success: true, output: "x", device_action: ACTION }),
    ).toEqual(ACTION);
  });

  it("finds nothing in a reply without a step", () => {
    expect(deviceActionFrom({ type: "token", content: "שלום" })).toBeNull();
    expect(deviceActionFrom({ type: "done", success: true })).toBeNull();
    expect(
      deviceActionFrom({ type: "done", device_action: undefined }),
    ).toBeNull();
    expect(deviceActionFrom(null)).toBeNull();
    expect(deviceActionFrom("device_action")).toBeNull();
  });

  it.each([
    ["an id that is not a row id", { ...ACTION, action_id: "#pay" }],
    ["a padded id", { ...ACTION, action_id: ` ${ACTION_ID}` }],
    ["a tool outside the contract", { ...ACTION, tool: "browser_pay" }],
    ["a missing tool", { action_id: ACTION_ID }],
    ["a number for an id", { ...ACTION, action_id: 7 }],
  ])("refuses %s", (_name, action) => {
    expect(
      deviceActionFrom({ type: DEVICE_ACTION_EVENT, ...action }),
    ).toBeNull();
    expect(deviceActionFrom({ device_action: action })).toBeNull();
  });
});

describe("isStepUnavailable", () => {
  it("knows the 409 body and the done event that carry the refusal", () => {
    expect(isStepUnavailable({ error: DEVICE_STEP_UNAVAILABLE })).toBe(true);
    expect(
      isStepUnavailable({
        type: "done",
        success: false,
        error: DEVICE_STEP_UNAVAILABLE,
      }),
    ).toBe(true);
  });

  it("is false for any other reply", () => {
    expect(isStepUnavailable({ error: "rate limited" })).toBe(false);
    expect(isStepUnavailable({ type: "done", success: true })).toBe(false);
    expect(isStepUnavailable(null)).toBe(false);
  });
});
