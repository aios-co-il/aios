/**
 * What a run-ai-agent request says about the user's browser (AIO-686). The site sends
 * `device: {tools}` only when the extension's panel announced those tools, and
 * `device_continuation: <action id>` only after the panel reported a step's outcome. Both
 * are the client's word: they let the server offer a read and resume a paused run, never
 * act. What gates an action is the panel claiming the row with the user's own session
 * (carmen-device-action), which a forged flag cannot do.
 */
import {
  DEVICE_CONTINUATION_TEXT,
  type DeviceRequestFields,
  type DeviceToolName,
  isDeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import { isObject } from "../../_shared/carmen/screen-context.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";

export type DeviceRequest = {
  /** The device tools the panel announced, as the site passed them on. */
  announced: ReadonlyArray<DeviceToolName>;
  /** Null on a typed message; on a continuation, the action's id, or null when it is not an id. */
  continuation: { actionId: string | null } | null;
};

/** Reads the request body's device fields; anything malformed announces nothing. */
export function deviceRequestOf(body: unknown): DeviceRequest {
  const device = fieldOf(body, "device" satisfies keyof DeviceRequestFields);
  const tools = fieldOf(device, "tools");
  const continuation = continuationField(body);

  return {
    announced: Array.isArray(tools) ? tools.filter(isDeviceToolName) : [],
    continuation:
      continuation === undefined
        ? null
        : { actionId: asUuidOrNull(continuation) },
  };
}

/**
 * Plan rule 10: a continuation's `command_text` is the contract's fixed string whatever the
 * client sent, so page text never travels in it and no text shortcut, acknowledgement or
 * memory step reads anything a page could have written. Called on the body as it arrives.
 */
export function fixContinuationText(body: Record<string, unknown>): void {
  if (continuationField(body) !== undefined) {
    body.command_text = DEVICE_CONTINUATION_TEXT;
  }
}

/** The continuation field when the body has one that is set, else undefined. */
function continuationField(body: unknown): unknown {
  const value = fieldOf(
    body,
    "device_continuation" satisfies keyof DeviceRequestFields,
  );
  return value === null ? undefined : value;
}

/** One field of an unvalidated object, or undefined. */
function fieldOf(value: unknown, field: string): unknown {
  return isObject(value) && field in value
    ? Object.getOwnPropertyDescriptor(value, field)?.value
    : undefined;
}
