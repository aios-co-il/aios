import { useEffect, useMemo, useState } from "react";
import {
  claimsPanelNamespace,
  PANEL_MESSAGE,
  panelSignal,
  parsePanelMessage,
} from "@functions/_shared/carmen/device/panel-envelope.ts";
import {
  type BrowserTab,
  type BrowserTabContextMetadata,
  browserTabContextMetadata,
} from "@functions/_shared/carmen/screen-context.ts";
import { EXTENSION_ORIGINS } from "./extensionOrigins";

/**
 * The browser tab the AIOS Chrome extension shares, when its side panel frames this page;
 * null on the site itself, in any other frame, and while no tab is shared. The page says
 * hello to the panel and then keeps the latest tab the panel reports.
 */
export function useExtensionTabContext(): BrowserTabContextMetadata | null {
  const [tab, setTab] = useState<BrowserTab | null>(null);

  useEffect(() => {
    const panelOrigin = framingExtensionOrigin();
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
      }
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage(panelSignal(PANEL_MESSAGE.hello), panelOrigin);

    return () => window.removeEventListener("message", onMessage);
  }, []);

  return useMemo(
    () => tab && browserTabContextMetadata(tab, new Date().toISOString()),
    [tab],
  );
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
