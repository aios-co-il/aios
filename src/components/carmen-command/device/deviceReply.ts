import {
  DEVICE_ACTION_EVENT,
  DEVICE_STEP_UNAVAILABLE,
  type DeviceActionReply,
  isDeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";
import {
  PANEL_MESSAGE,
  panelActionRef,
  parsePanelMessage,
} from "@functions/_shared/carmen/device/panel-envelope.ts";
import { isObject } from "@functions/_shared/carmen/screen-context.ts";

/** What the chat says when the server will not continue after a browser step. */
export const STEP_UNAVAILABLE_TEXT =
  "לא הצלחתי להמשיך אחרי הפעולה בדפדפן. אפשר לבקש שוב.";

/**
 * The browser step a run-ai-agent reply waits on, from any of its three shapes: the
 * stream's `device_action` event, the stream's `done` event, or the JSON reply. Null when
 * the value names none, or names one the panel would not accept (an id that is not a row
 * id, or a tool outside the contract).
 */
export function deviceActionFrom(value: unknown): DeviceActionReply | null {
  if (!isObject(value)) {
    return null;
  }
  if ("type" in value && value.type === DEVICE_ACTION_EVENT) {
    return actionReply(value);
  }
  return DEVICE_ACTION_EVENT in value
    ? actionReply(value[DEVICE_ACTION_EVENT])
    : null;
}

/**
 * Whether a reply is the server's one refusal of a continuation: the 409 body, or the
 * stream's `done` event that carries the same error.
 */
export function isStepUnavailable(value: unknown): boolean {
  return (
    isObject(value) &&
    "error" in value &&
    value.error === DEVICE_STEP_UNAVAILABLE
  );
}

/** The action id and tool of a value, when both are ones the panel would act on. */
function actionReply(value: unknown): DeviceActionReply | null {
  if (
    !isObject(value) ||
    !("action_id" in value) ||
    !("tool" in value) ||
    typeof value.action_id !== "string" ||
    !isDeviceToolName(value.tool)
  ) {
    return null;
  }
  // The panel's own parser decides what an action id is, so the site never posts one it drops.
  const posted = parsePanelMessage(
    panelActionRef(PANEL_MESSAGE.action, value.action_id),
  );

  return posted ? { action_id: value.action_id, tool: value.tool } : null;
}
