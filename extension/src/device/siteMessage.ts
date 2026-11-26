/**
 * Which messages the panel accepts from the framed Command Center: only from the frame it
 * created, at the app's exact origin, in the envelope's shape, and only the kinds a site
 * sends (hello, action, cancel). A message the panel itself sends never counts when it
 * arrives from the site.
 */
import {
  claimsPanelNamespace,
  PANEL_MESSAGE,
  type PanelMessage,
  parsePanelMessage,
} from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";

/** A message event as far as the check needs it. */
export type ReceivedMessage = {
  origin: string;
  source: unknown;
  data: unknown;
};

/** The framed site the panel listens to. */
export type FramedSite = { appOrigin: string; frameWindow: unknown };

/** The envelope's messages that travel from the site to the panel. */
export type SiteMessage =
  | { type: typeof PANEL_MESSAGE.hello; v: number }
  | {
      type: typeof PANEL_MESSAGE.action | typeof PANEL_MESSAGE.cancel;
      v: number;
      action_id: string;
    };

export type SiteMessageReading =
  | { kind: "accepted"; message: SiteMessage }
  /** From another window or origin; `claimsNamespace` says whether it is worth a log line. */
  | { kind: "foreign"; claimsNamespace: boolean }
  /** From the site, but not a message the site may send. */
  | { kind: "unexpected" };

const SITE_MESSAGE_TYPES: ReadonlyArray<string> = [
  PANEL_MESSAGE.hello,
  PANEL_MESSAGE.action,
  PANEL_MESSAGE.cancel,
];

/** Reads one received message. */
export function readSiteMessage(
  event: ReceivedMessage,
  site: FramedSite,
): SiteMessageReading {
  if (event.origin !== site.appOrigin || event.source !== site.frameWindow) {
    return {
      kind: "foreign",
      claimsNamespace: claimsPanelNamespace(event.data),
    };
  }
  const message = parsePanelMessage(event.data);

  return message && isSiteMessage(message)
    ? { kind: "accepted", message }
    : { kind: "unexpected" };
}

/** What the panel does with each accepted message. */
export type SiteMessageHandlers = {
  onHello: () => void;
  onAction: (id: string) => Promise<void>;
  onCancel: (id: string) => void;
};

/** Reads a received message and hands an accepted one to its handler; anything else is logged and dropped. */
export function routeSiteMessage(
  event: ReceivedMessage,
  site: FramedSite,
  handlers: SiteMessageHandlers,
): void {
  const reading = readSiteMessage(event, site);
  if (reading.kind !== "accepted") {
    logDropped(reading, event.origin);
    return;
  }

  const { message } = reading;
  if (message.type === PANEL_MESSAGE.action) {
    handlers.onAction(message.action_id).catch((error: unknown) => {
      console.error("[carmen-panel] the device action failed", error);
    });
  } else if (message.type === PANEL_MESSAGE.cancel) {
    handlers.onCancel(message.action_id);
  } else {
    handlers.onHello();
  }
}

/** Logs a dropped message; a foreign one only when it claims the envelope, since other extensions and pages post too. */
function logDropped(
  reading: Exclude<SiteMessageReading, { kind: "accepted" }>,
  origin: string,
): void {
  if (reading.kind === "unexpected") {
    console.warn("[carmen-panel] dropped an unexpected message from the site");
  } else if (reading.claimsNamespace) {
    console.warn(
      "[carmen-panel] dropped a message that is not from the framed site",
      origin,
    );
  }
}

/** Narrows a parsed message to the kinds the site sends. */
function isSiteMessage(message: PanelMessage): message is SiteMessage {
  return SITE_MESSAGE_TYPES.includes(message.type);
}
