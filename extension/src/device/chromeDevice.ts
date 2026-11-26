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
import { queryActiveTab } from "../activeTab";
import {
  COLLECTOR_RULES,
  type CollectorLimits,
  PAGE_SNAPSHOT_KEY,
} from "./keptSnapshot.ts";
import { collectPage } from "./pageCollector.ts";
import type { TabFacts } from "./readFlow.ts";
import { grantsToDrop } from "./siteGrant.ts";

// Twice the limits, so the cut in snapshot.ts falls after whitespace is collapsed.
const COLLECTOR_LIMITS: CollectorLimits = {
  textBudget: READ_PAGE_TEXT_MAX * 2,
  elementsMax: READ_PAGE_ELEMENTS_MAX,
  nameBudget: PAGE_ELEMENT_FIELD_MAX * 2,
  snapshotKey: PAGE_SNAPSHOT_KEY,
  rules: COLLECTOR_RULES,
};

/** The active tab of the panel's window. */
export async function activeTab(): Promise<TabFacts | null> {
  const tab = await queryActiveTab();

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

/** Runs the collector in the tab's top frame, keeping its snapshot as `snapshotId`, and returns its raw answer. */
export async function readPage(
  tabId: number,
  snapshotId: string,
): Promise<unknown> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectPage,
    args: [COLLECTOR_LIMITS, snapshotId],
  });

  return injection?.result;
}

/**
 * Sends the tab to the address and resolves once Chrome reports the load that followed
 * complete. Opening an address needs no site grant. Rejects when the tab is closed or
 * Chrome refuses the address; a stop removes the listeners, and the step's card life
 * bounds the wait (navigateFlow.ts).
 */
export function navigateTab(
  tabId: number,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // A `complete` before this load started belongs to the page being left.
    let loading = false;

    /**
     * Follows the tab's load. A `complete` while a navigation is still pending is the page
     * being left finishing its own load, not the destination.
     */
    function onUpdated(
      id: number,
      change: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ): void {
      if (id !== tabId) {
        return;
      }
      if (change.status === "loading") {
        loading = true;
      } else if (change.status === "complete" && loading && !tab.pendingUrl) {
        finish();
      }
    }

    /** The tab was closed under the step. */
    function onRemoved(id: number): void {
      if (id === tabId) {
        finish(new Error("The tab was closed while it loaded"));
      }
    }

    /** Ends the wait once and drops the listeners. */
    function finish(error?: unknown): void {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      signal.removeEventListener("abort", onStop);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    }

    /** The step was stopped; navigateFlow has already stopped waiting. */
    function onStop(): void {
      finish(new Error("The navigation wait was stopped"));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    signal.addEventListener("abort", onStop, { once: true });
    chrome.tabs.update(tabId, { url }).catch(finish);
  });
}

/**
 * Removes every site grant beyond the manifest's own host permissions (plan §2.6). One
 * origin at a time, since Chrome refuses a removal as a whole when any origin in it fails.
 * Never rejects: a grant Chrome keeps is logged, and the next panel open tries again.
 */
export async function dropSiteGrants(): Promise<void> {
  const granted = await chrome.permissions.getAll().catch((error: unknown) => {
    console.error("[carmen-panel] reading the site grants failed", error);
    return { origins: [] };
  });
  const origins = grantsToDrop(
    granted.origins ?? [],
    chrome.runtime.getManifest().host_permissions ?? [],
  );

  await Promise.all(
    origins.map((origin) =>
      chrome.permissions
        .remove({ origins: [origin] })
        .catch((error: unknown) => {
          console.error(
            `[carmen-panel] removing the grant for ${origin} failed`,
            error,
          );
        }),
    ),
  );
}

/** The fields of a Chrome tab a read uses. */
function tabFacts(tab: chrome.tabs.Tab): TabFacts | null {
  return tab.id === undefined
    ? null
    : {
        id: tab.id,
        url: tab.url,
        pendingUrl: tab.pendingUrl,
        title: tab.title ?? "",
      };
}
