/**
 * The Chrome calls behind a read, kept thin: every decision is in readFlow.ts and the
 * modules it imports. The tab's address comes from `chrome.tabs`, raw, and the page is read
 * by injecting the collector into the top frame in the extension's isolated world.
 */
import {
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
  PAGE_ELEMENT_FIELD_MAX,
} from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { collectPage, type CollectorLimits } from "./pageCollector.ts";
import type { TabFacts } from "./readFlow.ts";
import { grantsToDrop } from "./siteGrant.ts";

// Twice the limits, so the cut in snapshot.ts falls after whitespace is collapsed.
const COLLECTOR_LIMITS: CollectorLimits = {
  textBudget: READ_PAGE_TEXT_MAX * 2,
  elementsMax: READ_PAGE_ELEMENTS_MAX,
  nameBudget: PAGE_ELEMENT_FIELD_MAX * 2,
};

/** The active tab of the panel's window. */
export async function activeTab(): Promise<TabFacts | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  return tab ? tabFacts(tab) : null;
}

/** One tab by id; null when it is gone, which Chrome reports as a rejection and the read reports as `target_changed`. */
export async function tabById(tabId: number): Promise<TabFacts | null> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);

  return tab ? tabFacts(tab) : null;
}

/** Whether Chrome holds the grant for this site pattern. */
export function hasSiteGrant(pattern: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [pattern] });
}

/** Chrome's own prompt for one site; call it first thing in a click handler, which Chrome requires. */
export function requestSiteGrant(pattern: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [pattern] });
}

/** Runs the collector in the tab's top frame and returns its raw answer. */
export async function readPage(tabId: number): Promise<unknown> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectPage,
    args: [COLLECTOR_LIMITS],
  });

  return injection?.result;
}

/** Removes every site grant beyond the manifest's own host permissions (plan §2.6). */
export async function dropSiteGrants(): Promise<void> {
  const granted = (await chrome.permissions.getAll()).origins ?? [];
  const origins = grantsToDrop(
    granted,
    chrome.runtime.getManifest().host_permissions ?? [],
  );

  if (origins.length > 0) {
    await chrome.permissions.remove({ origins });
  }
}

/** The fields of a Chrome tab a read uses. */
function tabFacts(tab: chrome.tabs.Tab): TabFacts | null {
  return tab.id === undefined
    ? null
    : { id: tab.id, url: tab.url, title: tab.title ?? "" };
}
