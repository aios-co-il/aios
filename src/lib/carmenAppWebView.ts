/**
 * The query flag the Carmen Android app adds to the page it opens in its web view
 * (`AiosAccount.webStartUrl`). The app keeps its own organization, so a page there must never
 * write `user_active_tenant`: that row is the website's organization on every device, and
 * writing it would move the user's browser tabs on their computer.
 */
export const CARMEN_APP_PARAM = "carmen_app";

/** Where a tab remembers the flag, so navigation inside the app's web view keeps it. */
export const CARMEN_APP_STORAGE_KEY = "carmenAppWebView";

/**
 * Whether this tab is the Carmen Android app's web view: the page was opened with
 * `?carmen_app=1`, or an earlier page of this tab was. A tab opened with the flag remembers it
 * in sessionStorage; without storage, only the flagged page itself counts.
 */
export function isCarmenAppWebView(
  search: string = window.location.search,
  storage: Pick<Storage, "getItem" | "setItem"> | null = sessionStorageOrNull(),
): boolean {
  if (new URLSearchParams(search).get(CARMEN_APP_PARAM) === "1") {
    rememberFlag(storage);
    return true;
  }
  return readFlag(storage);
}

/** The tab's sessionStorage, or null where the browser refuses it. */
function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Stores the flag; a refused write is ignored, the flagged page still counts. */
function rememberFlag(storage: Pick<Storage, "setItem"> | null) {
  try {
    storage?.setItem(CARMEN_APP_STORAGE_KEY, "1");
  } catch {
    // Restricted storage: only the flagged page counts.
  }
}

/** Reads the flag; a refused read counts as not the app. */
function readFlag(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(CARMEN_APP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
