import {
  type BrowserTab,
  parseBrowserTab,
} from "../../supabase/functions/_shared/carmen/screen-context";

// Chrome words this permission "Read your browsing history", so it is optional and the
// user grants it from the panel's switch. The grant is also the switch's only state.
const TAB_SHARING: chrome.permissions.Permissions = { permissions: ["tabs"] };

/** Whether the user lets Carmen see the active tab. */
export function isTabShared(): Promise<boolean> {
  return chrome.permissions.contains(TAB_SHARING);
}

/** Asks Chrome to grant or drop tab sharing, from a click; resolves to the state it ends in. */
export async function setTabShared(shared: boolean): Promise<boolean> {
  if (shared) {
    return chrome.permissions.request(TAB_SHARING);
  }
  await chrome.permissions.remove(TAB_SHARING);

  return isTabShared();
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
