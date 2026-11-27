import { useEffect, useMemo, useRef, useState } from "react";
import {
  isDeviceToolName,
  type DeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";
import {
  claimsPanelNamespace,
  PANEL_MESSAGE,
  panelActionRef,
  panelSignal,
  parsePanelMessage,
} from "@functions/_shared/carmen/device/panel-envelope.ts";
import {
  type BrowserTab,
  type BrowserTabContextMetadata,
  browserTabContextMetadata,
} from "@functions/_shared/carmen/screen-context.ts";
import type { ClaimFailedListener, PanelChannel } from "./device/panelStep";
import { EXTENSION_ORIGINS } from "./extensionOrigins";

/** What the AIOS Chrome extension's side panel gives the chat it frames. */
export type ExtensionPanel = {
  /** The tab the panel shares; null while none is shared. */
  tabContext: BrowserTabContextMetadata | null;
  /** The line to the panel for browser steps (AIO-656). */
  panel: PanelChannel | null;
};

/**
 * The AIOS Chrome extension's side panel, when it frames this page; both fields are null on
 * the site itself and in any other frame. The page says hello to the panel, keeps the latest
 * tab and capabilities it reports, and reads a message only from the panel's exact origin
 * and window.
 */
export function useExtensionPanel(): ExtensionPanel {
  const [panelOrigin] = useState(framingExtensionOrigin);
  const [tab, setTab] = useState<BrowserTab | null>(null);
  const [tools, setTools] = useState<ReadonlyArray<DeviceToolName>>([]);
  const resultListeners = useRef(new Set<(actionId: string) => void>());
  const claimFailedListeners = useRef(new Set<ClaimFailedListener>());

  useEffect(() => {
    if (!panelOrigin) {
      return;
    }

    /** Reads a message only from the panel that frames this page; anything else is dropped. */
    function onMessage(event: MessageEvent) {
      if (event.origin !== panelOrigin || event.source !== window.parent) {
        logDropped("is not from the extension panel", event);
        return;
      }
      const message = parsePanelMessage(event.data);

      if (!message) {
        logDropped("is not a message of this protocol version", event);
        return;
      }
      if (message.type === PANEL_MESSAGE.tabContext) {
        setTab(message.tab);
      } else if (message.type === PANEL_MESSAGE.capabilities) {
        setTools(message.capabilities.filter(isDeviceToolName));
      } else if (message.type === PANEL_MESSAGE.result) {
        const actionId = message.action_id;

        resultListeners.current.forEach((listener) => listener(actionId));
      } else if (message.type === PANEL_MESSAGE.claimFailed) {
        const { action_id: actionId, reason } = message;

        claimFailedListeners.current.forEach((listener) =>
          listener(actionId, reason),
        );
      }
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage(panelSignal(PANEL_MESSAGE.hello), panelOrigin);

    return () => window.removeEventListener("message", onMessage);
  }, [panelOrigin]);

  const tabContext = useMemo(
    () => tab && browserTabContextMetadata(tab, new Date().toISOString()),
    [tab],
  );
  const panel = useMemo(
    () =>
      panelOrigin &&
      panelChannel(panelOrigin, tools, {
        result: resultListeners.current,
        claimFailed: claimFailedListeners.current,
      }),
    [panelOrigin, tools],
  );

  return { tabContext, panel: panel || null };
}

/** The action messages to the panel at its exact origin, and its results and failed claims to the listeners. */
function panelChannel(
  panelOrigin: string,
  tools: ReadonlyArray<DeviceToolName>,
  listeners: {
    result: Set<(actionId: string) => void>;
    claimFailed: Set<ClaimFailedListener>;
  },
): PanelChannel {
  return {
    tools,
    postAction: (actionId) =>
      window.parent.postMessage(
        panelActionRef(PANEL_MESSAGE.action, actionId),
        panelOrigin,
      ),
    postCancel: (actionId) =>
      window.parent.postMessage(
        panelActionRef(PANEL_MESSAGE.cancel, actionId),
        panelOrigin,
      ),
    onResult: (listener) => {
      listeners.result.add(listener);
      return () => listeners.result.delete(listener);
    },
    onClaimFailed: (listener) => {
      listeners.claimFailed.add(listener);
      return () => listeners.claimFailed.delete(listener);
    },
  };
}

/** The extension origin that frames this page directly, or null. */
function framingExtensionOrigin(): string | null {
  if (window.parent === window) {
    return null;
  }
  // Chrome lists the framing origins, nearest first; a browser without the list has no panel.
  const parentOrigin = window.location.ancestorOrigins?.[0];

  return parentOrigin && EXTENSION_ORIGINS.includes(parentOrigin)
    ? parentOrigin
    : null;
}

/** Other scripts post to every page, so only a message that claims this protocol is worth a line. */
function logDropped(reason: string, event: MessageEvent): void {
  if (claimsPanelNamespace(event.data)) {
    console.warn(
      `[carmen-panel] dropped a message that ${reason}`,
      event.origin,
    );
  }
}
