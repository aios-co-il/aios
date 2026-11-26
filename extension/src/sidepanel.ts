import {
  claimsPanelNamespace,
  PANEL_MESSAGE,
  panelCapabilities,
  panelSignal,
  panelTabContext,
  type PanelMessage,
  parsePanelMessage,
} from "../../supabase/functions/_shared/carmen/device/panel-envelope";
import type { BrowserTab } from "../../supabase/functions/_shared/carmen/screen-context";
import {
  isTabShared,
  onActiveTabChange,
  onTabSharingChange,
  readActiveTab,
  setTabShared,
} from "./activeTab";
import { APP_ORIGIN } from "./config";
import { supabase } from "./supabase";
import { loadTenants, preferredTenant } from "./tenants";

// The framed Command Center says hello when its chat is mounted. With no hello by then,
// the frame is on the site's sign-in page, was refused (Staging sits behind Vercel's
// sign-in, which does not allow framing) or is still loading, so the panel says what to do.
const HELLO_WAIT_MS = 8000;

const frame = el<HTMLIFrameElement>("carmen-frame");
const chip = el<HTMLDivElement>("tab-chip");
const shareSwitch = el<HTMLInputElement>("share-tab");
const notice = el<HTMLDivElement>("frame-notice");

let activeTab: BrowserTab | null = null;
let tabShared = false;
let siteListening = false;
/** The tab the site was last told about; undefined when it has not been told since its hello. */
let sentTab: BrowserTab | null | undefined;

// A start that fails frames nothing, so the line to show is the sign-in one: the notice
// about a site that did not answer is for a framed site (frameSite).
main().catch((error) => {
  console.error("[carmen-panel] failed to start", error);
  el<HTMLDivElement>("signin-notice").classList.remove("hidden");
});

/**
 * Frames the Command Center and keeps it told which tab Carmen may see. With no session
 * or organization in the extension there is no address to frame, so the panel frames
 * nothing and says to sign in from the popup.
 */
async function main(): Promise<void> {
  el<HTMLAnchorElement>("open-site").href = APP_ORIGIN;
  el<HTMLAnchorElement>("notice-link").href = APP_ORIGIN;

  const siteUrl = await commandCenterUrl();
  if (!siteUrl) {
    el<HTMLDivElement>("signin-notice").classList.remove("hidden");
    return;
  }
  frameSite(siteUrl);
  await followSharedTab();
}

/**
 * The active organization's Command Center, chosen as the popup chooses its organization,
 * so opening the panel never switches the organization under a recording. Null without a
 * session or an organization.
 */
async function commandCenterUrl(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const tenant = session ? await preferredTenant(await loadTenants()) : null;

  return tenant?.slug
    ? `${APP_ORIGIN}/t/${encodeURIComponent(tenant.slug)}/command-center`
    : null;
}

/** Loads the site in the frame, and shows the notice if it has not said hello in time. */
function frameSite(siteUrl: string): void {
  el<HTMLAnchorElement>("open-site").href = siteUrl;
  el<HTMLAnchorElement>("notice-link").href = siteUrl;
  window.addEventListener("message", onMessage);
  frame.classList.remove("hidden");
  frame.src = siteUrl;
  setTimeout(
    () => notice.classList.toggle("hidden", siteListening),
    HELLO_WAIT_MS,
  );
}

/** Shows the switch and the chip, and follows the grant and the active tab from now on. */
async function followSharedTab(): Promise<void> {
  el<HTMLDivElement>("tab-controls").classList.remove("hidden");
  shareSwitch.addEventListener("change", onShareSwitch);
  onTabSharingChange(syncTabSharing);
  onActiveTabChange(refreshTab);
  await syncTabSharing();
}

/** Reads a message only from the framed site at the app's exact origin; anything else is dropped. */
function onMessage(event: MessageEvent): void {
  if (event.origin !== APP_ORIGIN || event.source !== frame.contentWindow) {
    if (claimsPanelNamespace(event.data)) {
      console.warn(
        "[carmen-panel] dropped a message that is not from the framed site",
        event.origin,
      );
    }
    return;
  }
  if (parsePanelMessage(event.data)?.type !== PANEL_MESSAGE.hello) {
    console.warn("[carmen-panel] dropped an unexpected message from the site");
    return;
  }
  siteListening = true;
  // A hello comes from a chat that has just mounted and knows no tab yet.
  sentTab = undefined;
  notice.classList.add("hidden");
  post(panelSignal(PANEL_MESSAGE.ready));
  post(panelCapabilities());
  showAndSendTab();
}

/** The switch asks Chrome for the permission, then shows the state Chrome ended in. */
async function onShareSwitch(): Promise<void> {
  await setTabShared(shareSwitch.checked).catch((error) => {
    console.error("[carmen-panel] changing tab sharing failed", error);
  });
  await syncTabSharing();
}

/**
 * Sets the switch to the grant Chrome holds, which another window's panel may have changed.
 * A failed read is logged and counts as not shared, so no address is sent.
 */
async function syncTabSharing(): Promise<void> {
  tabShared = await isTabShared().catch((error) => {
    console.error("[carmen-panel] reading tab sharing failed", error);
    return false;
  });
  shareSwitch.checked = tabShared;
  await refreshTab();
}

/** Re-reads the active tab; a failed read is logged and counts as no tab. */
async function refreshTab(): Promise<void> {
  activeTab = await readActiveTab().catch((error) => {
    console.error("[carmen-panel] reading the active tab failed", error);
    return null;
  });
  showAndSendTab();
}

/**
 * Shows on the chip what Carmen sees, and tells the site once it listens. Chrome reports
 * several updates per page load, so a tab with the address and title already sent is not
 * sent again.
 */
function showAndSendTab(): void {
  const seen = tabShared ? activeTab : null;

  chip.textContent = chipText(seen);
  chip.title = seen?.url ?? "";
  chip.classList.toggle("shared", !!seen);
  if (!siteListening || (sentTab !== undefined && isSameTab(sentTab, seen))) {
    return;
  }
  sentTab = seen;
  post(panelTabContext(seen));
}

/** Whether two tabs, or two absences of one, are the same to Carmen. */
function isSameTab(one: BrowserTab | null, other: BrowserTab | null): boolean {
  return one?.url === other?.url && one?.title === other?.title;
}

/** The chip's words for a shared tab, a tab that is never sent, and sharing switched off. */
function chipText(seen: BrowserTab | null): string {
  if (!tabShared) {
    return "הלשונית לא משותפת עם כרמן";
  }
  return seen
    ? `כרמן רואה: ${seen.title || new URL(seen.url).host}`
    : "הלשונית הזו לא נשלחת לכרמן";
}

/** An element sidepanel.html declares. */
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Posts to the framed site only; the browser drops it if the frame has left the app's origin. */
function post(message: PanelMessage): void {
  frame.contentWindow?.postMessage(message, APP_ORIGIN);
}
