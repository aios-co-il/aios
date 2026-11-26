/**
 * The card the panel draws itself (plan rule 6) before Carmen reads a site for the first
 * time in this panel: it names the site from the tab's real address, and its allow button
 * asks Chrome for that one site from the tap, the user gesture Chrome requires. The
 * buttons wake after a short delay, so a tap meant for the chat below does not land on it.
 */
import type { GrantAnswer } from "./readFlow.ts";

const BUTTON_DELAY_MS = 500;

/** The card's elements in sidepanel.html. */
export type GrantCardElements = {
  card: HTMLElement;
  title: HTMLElement;
  allow: HTMLButtonElement;
  decline: HTMLButtonElement;
};

/** The title line naming the site. */
export function grantCardTitle(host: string): string {
  return `כרמן מבקשת לקרוא את הדף באתר ${host}`;
}

/**
 * Shows the card for one site until a tap or a stop. `requestGrant` is called
 * synchronously in the allow handler, before anything awaits.
 */
export function askGrantOnCard(
  elements: GrantCardElements,
  site: { host: string; pattern: string },
  signal: AbortSignal,
  requestGrant: (pattern: string) => Promise<boolean>,
): Promise<GrantAnswer> {
  return new Promise((resolve, reject) => {
    const wake = setTimeout(() => setEnabled(true), BUTTON_DELAY_MS);
    let settled = false;

    /**
     * Hides the card and settles once. Chrome may answer a tap after the step was stopped,
     * by which time the card may be showing for the next step: that late answer is dropped.
     */
    function settle(answer: GrantAnswer | Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(wake);
      elements.allow.removeEventListener("click", onAllow);
      elements.decline.removeEventListener("click", onDecline);
      signal.removeEventListener("abort", onStop);
      elements.card.classList.add("hidden");
      if (answer instanceof Error) {
        reject(answer);
      } else {
        resolve(answer);
      }
    }

    /** Asks Chrome from the tap; a refused prompt is a decline. */
    function onAllow(): void {
      setEnabled(false);
      requestGrant(site.pattern).then(
        (granted) => settle(granted ? "allowed" : "declined"),
        (error: unknown) =>
          settle(error instanceof Error ? error : new Error(String(error))),
      );
    }

    /** The user said no on the card. */
    function onDecline(): void {
      settle("declined");
    }

    /** A cancel, the expiry or the panel closing. */
    function onStop(): void {
      settle("stopped");
    }

    /** Wakes or sleeps both buttons. */
    function setEnabled(enabled: boolean): void {
      elements.allow.disabled = !enabled;
      elements.decline.disabled = !enabled;
    }

    if (signal.aborted) {
      settle("stopped");
      return;
    }
    elements.title.textContent = grantCardTitle(site.host);
    setEnabled(false);
    elements.allow.addEventListener("click", onAllow);
    elements.decline.addEventListener("click", onDecline);
    signal.addEventListener("abort", onStop);
    elements.card.classList.remove("hidden");
  });
}
