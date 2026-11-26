import {
  DEVICE_CONTINUATION_TEXT,
  type DeviceRequestFields,
  type DeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";
import type { PanelChannel } from "./panelStep";

/** A continuation of a run paused at a browser step (AIO-656). */
export type StepContinuation = {
  /** The step the panel reported on. */
  actionId: string;
  /** The paused run's id: a continuation resumes that run, never a new one. */
  runId: string;
  /** The reply_key of the answer the continuation's text joins. */
  intoReplyKey: string;
};

/** What a chat request says about the extension's panel, when one frames the chat. */
export type StreamDevice = {
  /** The device tools to offer: what `deviceToolsToSend` returned for the request. */
  tools?: ReadonlyArray<DeviceToolName>;
  continuation?: StepContinuation;
};

/**
 * The device tools a request may announce: those the extension's side panel named in its
 * capabilities message, and only while it frames this page. On the site itself, in any
 * other frame and while tab sharing is off, nothing: the request carries no device field.
 */
export function deviceToolsToSend(
  panel: PanelChannel | null,
): ReadonlyArray<DeviceToolName> | undefined {
  return panel && panel.tools.length > 0 ? panel.tools : undefined;
}

/**
 * The request fields a device step decides: the text, and the device fields typed in the
 * contract. A continuation sends the contract's fixed text, so nothing a page wrote ever
 * travels in `command_text`; the server forces the same text whatever arrives.
 */
export function stepRequestFields(
  text: string,
  device: StreamDevice | undefined,
): DeviceRequestFields & { command_text: string } {
  const continuation = device?.continuation;

  return {
    command_text: continuation ? DEVICE_CONTINUATION_TEXT : text,
    ...(device?.tools?.length ? { device: { tools: device.tools } } : {}),
    ...(continuation ? { device_continuation: continuation.actionId } : {}),
  };
}
