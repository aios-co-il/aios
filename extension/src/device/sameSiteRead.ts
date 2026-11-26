/**
 * The read of a tab that was ruled on, discarded when the tab is no longer that page.
 */
import type { PageLocation } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { readCollectedPage } from "./collectedPage.ts";
import type { CollectedPage } from "./pageCollector.ts";
import type { ReadDeps } from "./readFlow.ts";
import { decideReadStep } from "./readStep.ts";

/**
 * Reads the tab only while it is still the one in front of the user and stays on the
 * origin that was ruled on: before the collector runs the tab must be the active one with
 * no navigation pending, after it Chrome's address and the page's own `location.origin`
 * must still match, and any change discards the read. The reported location and title are
 * Chrome's after the read. Plan rule 7's `documentId` check is deferred (AIO-656): the
 * page's origin catches a navigation away and back across sites, not one within the site.
 */
export async function readSameSite(
  tabId: number,
  origin: string,
  deps: ReadDeps,
): Promise<{
  location: PageLocation;
  tabTitle: string;
  page: CollectedPage;
} | null> {
  if ((await deps.activeTab())?.id !== tabId) {
    return null;
  }
  const beforeTab = await deps.tab(tabId);
  const before = decideReadStep(beforeTab?.url, deps.origins);
  if (
    beforeTab?.pendingUrl ||
    before.kind !== "read" ||
    before.location.origin !== origin
  ) {
    return null;
  }
  const raw = await deps.readPage(tabId);
  const afterTab = await deps.tab(tabId);
  const after = decideReadStep(afterTab?.url, deps.origins);
  if (!afterTab || after.kind !== "read" || after.location.origin !== origin) {
    return null;
  }

  const page = readCollectedPage(raw);
  if (!page) {
    throw new Error("The page collector returned something else");
  }
  if (page.origin !== origin) {
    return null;
  }
  return { location: after.location, tabTitle: afterTab.title, page };
}
