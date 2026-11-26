import {
  type BrowserTab,
  parseBrowserTab,
} from "../../supabase/functions/_shared/carmen/screen-context";

/**
 * The permission behind the panel's "Carmen sees the tab" switch. Chrome words it "Read
 * your browsing history", so the manifest lists it as optional and the user grants it
 * from the switch. The grant is also the switch's only state.
 */
export const TAB_SHARING_PERMISSION = "tabs";

const TAB_SHARING: chrome.permissions.Permissions = {
  permissions: [TAB_SHARING_PERMISSION],
};

/** Whether the user lets Carmen see the active tab. */
export function isTabShared(): Promise<boolean> {
  return chrome.permissions.contains(TAB_SHARING);
}

/** Asks Chrome to grant or drop tab sharing, from a click; the user may refuse the grant. */
export async function setTabShared(shared: boolean): Promise<void> {
  if (shared) {
    await chrome.permissions.request(TAB_SHARING);
  } else {
    await chrome.permissions.remove(TAB_SHARING);
  }
}

/** Calls `onChange` when tab sharing is granted or dropped anywhere, such as another window's panel. */
export function onTabSharingChange(onChange: () => void): void {
  chrome.permissions.onAdded.addListener(onChange);
  chrome.permissions.onRemoved.addListener(onChange);
}

/**
 * The active tab of the window this panel belongs to. Null for a tab that is not a web
 * page and for one Chrome does not let the extension read.
 */
export async function readActiveTab(): Promise<BrowserTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  return parseBrowserTab(tab);
}

/** Calls `onChange` when a tab is switched to, or an active tab's address or title changes. */
export function onActiveTabChange(onChange: () => void): void {
  chrome.tabs.onActivated.addListener(onChange);
  chrome.tabs.onUpdated.addListener((_tabId, _change, tab) => {
    if (tab.active) {
      onChange();
    }
  });
}
