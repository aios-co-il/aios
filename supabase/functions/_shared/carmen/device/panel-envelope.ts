/**
 * The messages the Chrome extension's side panel and the framed Command Center exchange
 * with postMessage. One envelope: every message has a `type` under "carmen:" and the
 * protocol version `v`, so Carmen acting in Chrome (AIO-656) adds kinds here instead of a
 * second channel. A device action travels as its id only: the panel acts on the row it
 * claims from the server with its own session, never on what the framed site posts. Each
 * side also checks the sender's exact origin before it reads a message.
 */
import { DEVICE_TOOL_NAMES, type DeviceToolName } from "./contract.ts";
import {
  type BrowserTab,
  isObject,
  parseBrowserTab,
} from "../screen-context.ts";

export const PANEL_PROTOCOL_VERSION = 1;

/** Every message type starts with this, which tells a foreign message apart. */
export const PANEL_MESSAGE_NAMESPACE = "carmen:";

export const PANEL_MESSAGE = {
  /** Site to panel: the Command Center is mounted and listening. */
  hello: "carmen:hello",
  /** Panel to site: the hello was heard; capabilities and the tab follow. */
  ready: "carmen:ready",
  /** Panel to site: what this build of the extension can do. */
  capabilities: "carmen:capabilities",
  /** Panel to site: the tab Carmen may see, or null when none is shared. */
  tabContext: "carmen:tab-context",
  /** Site to panel: the server recorded a device action; claim it and act. */
  action: "carmen:action",
  /** Panel to site: the action's row is complete; ask the server to continue the run. */
  result: "carmen:result",
  /** Site to panel: the user stopped the run or wrote again; drop the action and its card. */
  cancel: "carmen:cancel",
} as const;

const TAB_CONTEXT_CAPABILITIES = ["tab-context"] as const;

/** What an extension build can do for the site: share the tab, and each device tool by its name. */
export type PanelCapability =
  (typeof TAB_CONTEXT_CAPABILITIES)[number] | DeviceToolName;

const KNOWN_CAPABILITIES: ReadonlyArray<PanelCapability> = [
  ...TAB_CONTEXT_CAPABILITIES,
  ...DEVICE_TOOL_NAMES,
];

type PanelSignalType = typeof PANEL_MESSAGE.hello | typeof PANEL_MESSAGE.ready;

type PanelActionType =
  | typeof PANEL_MESSAGE.action
  | typeof PANEL_MESSAGE.result
  | typeof PANEL_MESSAGE.cancel;

const ACTION_TYPES: ReadonlyArray<string> = [
  PANEL_MESSAGE.action,
  PANEL_MESSAGE.result,
  PANEL_MESSAGE.cancel,
];

/** A row id as PostgreSQL writes it: a hyphenated uuid and nothing else. */
const ACTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PanelMessage =
  | { type: PanelSignalType; v: number }
  | {
      type: typeof PANEL_MESSAGE.capabilities;
      v: number;
      capabilities: Array<PanelCapability>;
    }
  | {
      type: typeof PANEL_MESSAGE.tabContext;
      v: number;
      tab: BrowserTab | null;
    }
  | { type: PanelActionType; v: number; action_id: string };

/** Reads a received value; null for another version, an unknown kind or a malformed payload. */
export function parsePanelMessage(data: unknown): PanelMessage | null {
  if (
    !isObject(data) ||
    !("type" in data) ||
    !("v" in data) ||
    data.v !== PANEL_PROTOCOL_VERSION
  ) {
    return null;
  }
  if (data.type === PANEL_MESSAGE.hello || data.type === PANEL_MESSAGE.ready) {
    return panelSignal(data.type);
  }
  if (data.type === PANEL_MESSAGE.tabContext && "tab" in data) {
    return panelTabContext(data.tab);
  }
  if (
    data.type === PANEL_MESSAGE.capabilities &&
    "capabilities" in data &&
    Array.isArray(data.capabilities)
  ) {
    return panelCapabilities(data.capabilities);
  }
  if (
    isActionType(data.type) &&
    "action_id" in data &&
    typeof data.action_id === "string" &&
    ACTION_ID.test(data.action_id)
  ) {
    return panelActionRef(data.type, data.action_id);
  }
  return null;
}

/** Whether a received value claims to be one of these messages, whatever its origin or shape. */
export function claimsPanelNamespace(data: unknown): boolean {
  return (
    isObject(data) &&
    "type" in data &&
    typeof data.type === "string" &&
    data.type.startsWith(PANEL_MESSAGE_NAMESPACE)
  );
}

/** A hello or ready message of this version. */
export function panelSignal(type: PanelSignalType): PanelMessage {
  return { type, v: PANEL_PROTOCOL_VERSION };
}

/**
 * The capabilities message: the known ones among a build's or a received list. Without a
 * list it announces tab sharing only, so a build offers a device tool by naming it here.
 */
export function panelCapabilities(
  received: ReadonlyArray<unknown> = TAB_CONTEXT_CAPABILITIES,
): PanelMessage {
  return {
    type: PANEL_MESSAGE.capabilities,
    v: PANEL_PROTOCOL_VERSION,
    capabilities: KNOWN_CAPABILITIES.filter((known) =>
      received.includes(known),
    ),
  };
}

/**
 * An action, result or cancel message. It carries the action's id and nothing else: the
 * tool, its arguments and its result live on the row, which only the server writes.
 */
export function panelActionRef(
  type: PanelActionType,
  actionId: string,
): PanelMessage {
  return { type, v: PANEL_PROTOCOL_VERSION, action_id: actionId };
}

/** Narrows a message type to the three that reference a device action. */
function isActionType(type: unknown): type is PanelActionType {
  return typeof type === "string" && ACTION_TYPES.includes(type);
}

/** The tab-context message; the tab goes through the shared parser on the way out and in. */
export function panelTabContext(tab: unknown): PanelMessage {
  return {
    type: PANEL_MESSAGE.tabContext,
    v: PANEL_PROTOCOL_VERSION,
    tab: parseBrowserTab(tab),
  };
}
