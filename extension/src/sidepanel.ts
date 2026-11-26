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
  readActiveTab,
  setTabShared,
} from "./activeTab";
import { APP_ORIGIN } from "./config";
import { supabase } from "./supabase";
import { loadTenants, preferredTenant } from "./tenants";

// The framed Command Center says hello when its chat is mounted. With no hello by then,
// the frame is on a sign-in page or was refused (Staging sits behind Vercel's sign-in,
// which does not allow framing), so the panel offers the site in a tab.
const HELLO_WAIT_MS = 8000;

const frame = el<HTMLIFrameElement>("carmen-frame");
const chip = el<HTMLDivElement>("tab-chip");
const shareSwitch = el<HTMLInputElement>("share-tab");
const notice = el<HTMLDivElement>("frame-notice");

let activeTab: BrowserTab | null = null;
let tabShared = false;
let siteListening = false;

main().catch((error) => {
  console.error("[carmen-panel] failed to start", error);
  notice.classList.remove("hidden");
});

/** Frames the Command Center and keeps it told which tab Carmen may see. */
async function main(): Promise<void> {
  el<HTMLAnchorElement>("open-site").href = APP_ORIGIN;
  el<HTMLAnchorElement>("notice-link").href = APP_ORIGIN;
  window.addEventListener("message", onMessage);

  const siteUrl = await commandCenterUrl();
  el<HTMLAnchorElement>("open-site").href = siteUrl;
  el<HTMLAnchorElement>("notice-link").href = siteUrl;
  frame.src = siteUrl;
  setTimeout(
    () => notice.classList.toggle("hidden", siteListening),
    HELLO_WAIT_MS,
  );

  tabShared = await isTabShared();
  shareSwitch.checked = tabShared;
  shareSwitch.addEventListener("change", onShareSwitch);
  onActiveTabChange(refreshTab);
  await refreshTab();
}

/**
 * The active organization's Command Center, chosen as the popup chooses its organization,
 * so opening the panel never switches the organization under a recording. Without a
 * session or an organization it is the site's front page.
 */
async function commandCenterUrl(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const tenant = session ? await preferredTenant(await loadTenants()) : null;

  return tenant?.slug
    ? `${APP_ORIGIN}/t/${encodeURIComponent(tenant.slug)}/command-center`
    : APP_ORIGIN;
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
  notice.classList.add("hidden");
  post(panelSignal(PANEL_MESSAGE.ready));
  post(panelCapabilities());
  showAndSendTab();
}

/** The switch asks Chrome for the permission, then shows the state Chrome ended in. */
async function onShareSwitch(): Promise<void> {
  try {
    tabShared = await setTabShared(shareSwitch.checked);
  } catch (error) {
    console.error("[carmen-panel] changing tab sharing failed", error);
    tabShared = await isTabShared();
  }
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

/** Shows on the chip what Carmen sees, and tells the site once it listens. */
function showAndSendTab(): void {
  const seen = tabShared ? activeTab : null;

  chip.textContent = chipText(seen);
  chip.title = seen?.url ?? "";
  chip.classList.toggle("shared", !!seen);
  if (siteListening) {
    post(panelTabContext(seen));
  }
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
