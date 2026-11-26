/**
 * The card the panel draws itself (plan rule 6): before Carmen reads a site for the first
 * time in this panel, and before every navigation, click and typing step. It names the site from the tab's real
 * address or the claimed row, never from the framed site. The read card's allow button
 * asks Chrome for that one site from the tap, the user gesture Chrome requires. The
 * buttons wake after a short delay, so a tap meant for the chat below does not land on it.
 */
import { type CardWords, readCardWords } from "./cardWords.ts";
import type { GrantAnswer } from "./readFlow.ts";

const BUTTON_DELAY_MS = 500;

/** The card's elements in sidepanel.html. */
export type GrantCardElements = {
  card: HTMLElement;
  title: HTMLElement;
  /** The address a navigation or click card is about; hidden when the card has none. */
  address: HTMLElement;
  /** The text a typing card would type; hidden on every other card. */
  quote: HTMLElement;
  text: HTMLElement;
  allow: HTMLButtonElement;
  decline: HTMLButtonElement;
};

/**
 * Shows the read card for one site until a tap or a stop. `requestGrant` is called
 * synchronously in the allow handler, before anything awaits.
 */
export function askGrantOnCard(
  elements: GrantCardElements,
  site: { host: string; pattern: string },
  signal: AbortSignal,
  requestGrant: (pattern: string) => Promise<boolean>,
): Promise<GrantAnswer> {
  return askOnCard(elements, readCardWords(site.host), signal, () =>
    requestGrant(site.pattern),
  );
}

/**
 * Shows the card with these words until a tap or a stop. `onAllow` runs synchronously in
 * the allow handler, so it may ask Chrome for a permission; its false is a decline.
 */
export function askOnCard(
  elements: GrantCardElements,
  words: CardWords,
  signal: AbortSignal,
  onAllow: () => Promise<boolean>,
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
      elements.allow.removeEventListener("click", onAllowTap);
      elements.decline.removeEventListener("click", onDecline);
      signal.removeEventListener("abort", onStop);
      elements.card.classList.add("hidden");
      if (answer instanceof Error) {
        reject(answer);
      } else {
        resolve(answer);
      }
    }

    /** The tap on allow; a refused prompt is a decline. */
    function onAllowTap(): void {
      setEnabled(false);
      onAllow().then(
        (allowed) => settle(allowed ? "allowed" : "declined"),
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
    elements.title.textContent = words.title;
    elements.address.textContent = words.address ?? "";
    elements.address.classList.toggle("hidden", words.address === null);
    elements.quote.textContent = words.quote ?? "";
    elements.quote.classList.toggle("hidden", words.quote === null);
    elements.text.textContent = words.text;
    elements.allow.textContent = words.allow;
    setEnabled(false);
    elements.allow.addEventListener("click", onAllowTap);
    elements.decline.addEventListener("click", onDecline);
    signal.addEventListener("abort", onStop);
    elements.card.classList.remove("hidden");
  });
}
