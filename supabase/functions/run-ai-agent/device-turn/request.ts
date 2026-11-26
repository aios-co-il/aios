/**
 * What a run-ai-agent request says about the user's browser (AIO-686). The site sends
 * `device: {tools}` only when the extension's panel announced those tools, and
 * `device_continuation: <action id>` only after the panel reported a step's outcome. Both
 * are the client's word: they let the server offer a read and resume a paused run, never
 * act. What gates an action is the panel claiming the row with the user's own session
 * (carmen-device-action), which a forged flag cannot do.
 */
import {
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
  const device = fieldOf(body, "device");
  const tools = fieldOf(device, "tools");
  const continuation = fieldOf(body, "device_continuation");

  return {
    announced: Array.isArray(tools) ? tools.filter(isDeviceToolName) : [],
    continuation:
      continuation === undefined || continuation === null
        ? null
        : { actionId: asUuidOrNull(continuation) },
  };
}

/** One field of an unvalidated object, or undefined. */
function fieldOf(value: unknown, field: string): unknown {
  return isObject(value) && field in value
    ? Object.getOwnPropertyDescriptor(value, field)?.value
    : undefined;
}
