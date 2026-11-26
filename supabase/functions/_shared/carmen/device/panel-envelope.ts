/**
 * The messages the Chrome extension's side panel and the framed Command Center exchange
 * with postMessage. One envelope: every message has a `type` under "carmen:" and the
 * protocol version `v`, so Carmen acting in Chrome (the stage after AIO-655) adds kinds
 * here instead of a second channel. "carmen:action" and "carmen:result" are reserved for
 * it; nothing sends or reads them yet. Each side also checks the sender's exact origin
 * before it reads a message.
 */
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
} as const;

const CAPABILITIES = ["tab-context"] as const;

/** What an extension build can do for the site. The next stage adds its action names. */
export type PanelCapability = (typeof CAPABILITIES)[number];

type PanelSignalType = typeof PANEL_MESSAGE.hello | typeof PANEL_MESSAGE.ready;

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
    };

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

/** The capabilities message: this build's own, or the known ones among a received list. */
export function panelCapabilities(
  received: ReadonlyArray<unknown> = CAPABILITIES,
): PanelMessage {
  return {
    type: PANEL_MESSAGE.capabilities,
    v: PANEL_PROTOCOL_VERSION,
    capabilities: CAPABILITIES.filter((known) => received.includes(known)),
  };
}

/** The tab-context message; the tab goes through the shared parser on the way out and in. */
export function panelTabContext(tab: unknown): PanelMessage {
  return {
    type: PANEL_MESSAGE.tabContext,
    v: PANEL_PROTOCOL_VERSION,
    tab: parseBrowserTab(tab),
  };
}
