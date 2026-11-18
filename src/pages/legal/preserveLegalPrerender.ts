import { LEGAL_PAGES } from "./legalPages";

export const SNAPSHOT_ID = "legal-prerender";

/** Keep the server's DOM visible until the lazy client route commits. */
export function preserveLegalPrerender(root: HTMLElement): void {
  if (
    !root.hasChildNodes() ||
    !LEGAL_PAGES.some(
      (page) => page.path === window.location.pathname.replace(/\/$/, ""),
    )
  ) {
    return;
  }

  const snapshot = document.createElement("div");
  snapshot.id = SNAPSHOT_ID;
  while (root.firstChild) {
    snapshot.appendChild(root.firstChild);
  }
  root.before(snapshot);
  root.hidden = true;
}

/**
 * Shows the app root and drops the static snapshot. Runs once the legal route
 * commits, or when an error boundary's fallback replaces it.
 */
export function revealPrerenderedApp(): void {
  const snapshot = document.getElementById(SNAPSHOT_ID);
  if (!snapshot) {
    return;
  }

  const root = document.getElementById("root");
  if (root) {
    root.hidden = false;
  }
  snapshot.remove();
}
