/**
 * Turns what the page collector returned into the `browser_read_page` result: each field
 * cut to the contract's limits on a code-point boundary, so the server never refuses it
 * for length or for half an emoji. Limits count UTF-16 units, as the server measures them.
 */
import {
  PAGE_ELEMENT_FIELD_MAX,
  type PageElement,
  type PageLocation,
  type PageSnapshot,
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
  RESULT_FIELD_MAX,
} from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { toolResult } from "../../../supabase/functions/carmen-device-action/result.ts";
import type { CollectedPage } from "./pageCollector.ts";

/** Everything the snapshot is made of; the title is Chrome's, never the page's DOM. */
export type SnapshotInput = {
  location: PageLocation;
  tabTitle: string;
  page: CollectedPage;
  snapshotId: string;
};

/**
 * The read result. Checked with the server's own result check before it is returned, so a
 * shaping bug fails here, loudly, instead of as `invalid_result` on the row.
 */
export function pageSnapshot(input: SnapshotInput): PageSnapshot {
  const snapshot: PageSnapshot = {
    ...input.location,
    snapshot_id: input.snapshotId,
    title: oneLineUpTo(input.tabTitle, RESULT_FIELD_MAX),
    elements: input.page.elements
      .slice(0, READ_PAGE_ELEMENTS_MAX)
      .map(pageElement),
    text: textUpTo(input.page.text, READ_PAGE_TEXT_MAX),
  };

  // The user id only matters for a screenshot's file path.
  if (!toolResult("browser_read_page", snapshot, "")) {
    throw new Error("The read snapshot does not fit the contract's result");
  }
  return snapshot;
}

/**
 * Page text as the model gets it: well formed, no control characters but line breaks,
 * runs of spaces as one space, blank lines as one line break, then cut to `max`.
 */
export function textUpTo(text: string, max: number): string {
  const normalized = text
    .toWellFormed()
    .replace(/[^\S\n]+/g, " ")
    .replace(/(?!\n)\p{Cc}/gu, "")
    .replace(/ *\n\s*/g, "\n")
    .trim();

  return cutAtCodePoint(normalized, max);
}

/** A title, role or name: one line, well formed, cut to `max`. */
export function oneLineUpTo(text: string, max: number): string {
  const line = text
    .toWellFormed()
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();

  return cutAtCodePoint(line, max);
}

/**
 * At most `max` UTF-16 units, never ending on the first half of a surrogate pair, which
 * the server refuses as a lone surrogate.
 */
export function cutAtCodePoint(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);

  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** One element: a ref in document order, and the role and name cut to their limit. */
function pageElement(
  element: CollectedPage["elements"][number],
  index: number,
): PageElement {
  return {
    ref: `e${index + 1}`,
    role: oneLineUpTo(element.role, PAGE_ELEMENT_FIELD_MAX),
    name: oneLineUpTo(element.name, PAGE_ELEMENT_FIELD_MAX),
  };
}
