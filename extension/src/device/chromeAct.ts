/**
 * The Chrome calls behind a click or a type, kept thin: every decision is in actFlow.ts and
 * the modules it imports. Each injection goes to the top frame only, in the extension's
 * isolated world; after the tap, only to the document the card was drawn from.
 */
import type { ActDeps } from "./actFlow.ts";
import type { KeptSnapshot, PageActRequest } from "./keptSnapshot.ts";
import { PAGE_SNAPSHOT_KEY } from "./keptSnapshot.ts";
import { actOnPage } from "./pageAct.ts";
import { installPageInput } from "./pageInput.ts";

/** How long the panel waits for a load to start after a click or a type. */
const SETTLE_QUIET_MS = 600;
/** The longest it waits for a load the step started to finish. */
const SETTLE_MAX_MS = 8000;

/** Runs the acting function in the tab's top frame; its document's id and raw answer. */
export async function inspectTarget(
  tabId: number,
  request: PageActRequest,
): ReturnType<ActDeps["inspectTarget"]> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: actOnPage,
    args: [request],
  });
  if (!injection || injection.frameId !== 0) {
    throw new Error("The acting function did not run in the top frame");
  }
  return { documentId: injection.documentId, answer: injection.result };
}

/**
 * Installs the events and runs the acting function again, in that one document only:
 * Chrome refuses the injection when the tab now shows another document, which is null.
 */
export async function actOnTarget(
  tabId: number,
  documentId: string,
  request: PageActRequest,
): Promise<unknown> {
  const target = { tabId, documentIds: [documentId] };
  try {
    await chrome.scripting.executeScript({
      target,
      func: installPageInput,
      args: [request.inputKey],
    });
    const [injection] = await chrome.scripting.executeScript({
      target,
      func: actOnPage,
      args: [request],
    });
    return injection?.result ?? null;
  } catch (error) {
    console.warn("[carmen-panel] the tap's document is gone", error);
    return null;
  }
}

/**
 * Resolves once a load the step started has finished, after a short wait when none started,
 * and at the latest after `SETTLE_MAX_MS`. Never rejects: the step has already run.
 */
export function settleTab(tabId: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const cap = setTimeout(finish, SETTLE_MAX_MS);
    const quiet = setTimeout(checkLoading, SETTLE_QUIET_MS);

    /** A load of this tab finished. */
    function onUpdated(id: number, change: chrome.tabs.TabChangeInfo): void {
      if (id === tabId && change.status === "complete") {
        finish();
      }
    }

    /** No load started: the step's page is as it will be. */
    async function checkLoading(): Promise<void> {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.status !== "loading") {
        finish();
      }
    }

    /** Ends the wait once and drops the listeners. */
    function finish(): void {
      clearTimeout(cap);
      clearTimeout(quiet);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      signal.removeEventListener("abort", finish);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Whether the tab's top document still holds the read's snapshot; false when it cannot be asked. */
export async function holdsSnapshot(
  tabId: number,
  snapshotId: string,
): Promise<boolean> {
  const answer = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: keptSnapshotId,
      args: [PAGE_SNAPSHOT_KEY],
    })
    .catch((error: unknown) => {
      console.warn(
        "[carmen-panel] asking the page for its snapshot failed",
        error,
      );
      return [];
    });
  return answer[0]?.result === snapshotId;
}

/** The id of the snapshot the isolated world keeps. Runs in the tab. */
function keptSnapshotId(snapshotKey: string): string | null {
  // Own properties only, as in pageAct.ts: never an element the page named so.
  const kept: Partial<KeptSnapshot> | undefined =
    Object.getOwnPropertyDescriptor(globalThis, snapshotKey)?.value;
  return typeof kept?.id === "string" ? kept.id : null;
}
