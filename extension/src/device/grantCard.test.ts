// @vitest-environment happy-dom
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askGrantOnCard, type GrantCardElements } from "./grantCard.ts";

const SITE = { host: "shop.example", pattern: "https://shop.example/*" };

let elements: GrantCardElements;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <div id="card" class="hidden"><div id="title"></div>
      <button id="allow">allow</button><button id="decline">decline</button></div>`;
  elements = {
    card: byId("card", HTMLElement),
    title: byId("title", HTMLElement),
    allow: byId("allow", HTMLButtonElement),
    decline: byId("decline", HTMLButtonElement),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

/** One element of the test page, narrowed to its type. */
function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) {
    throw new Error(`the test page has no ${id}`);
  }
  return found;
}

/** A user who taps on fake time. */
function user() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

/** Shows the card and lets its buttons wake. */
function shownCard(
  requestGrant: (pattern: string) => Promise<boolean>,
  signal = new AbortController().signal,
) {
  const answer = askGrantOnCard(elements, SITE, signal, requestGrant);
  vi.advanceTimersByTime(500);
  return answer;
}

describe("askGrantOnCard", () => {
  it("names the site and keeps its buttons asleep for 500 ms", () => {
    void askGrantOnCard(elements, SITE, new AbortController().signal, vi.fn());

    expect(elements.card.classList.contains("hidden")).toBe(false);
    expect(elements.title.textContent).toContain("shop.example");

    vi.advanceTimersByTime(499);
    expect(elements.allow.disabled).toBe(true);
    expect(elements.decline.disabled).toBe(true);

    vi.advanceTimersByTime(1);
    expect(elements.allow.disabled).toBe(false);
    expect(elements.decline.disabled).toBe(false);
  });

  it("asks Chrome for the site from the tap and answers with Chrome's grant", async () => {
    const requestGrant = vi.fn(async () => true);
    const answer = shownCard(requestGrant);

    await user().click(elements.allow);

    expect(requestGrant).toHaveBeenCalledWith(SITE.pattern);
    expect(await answer).toBe("allowed");
    expect(elements.card.classList.contains("hidden")).toBe(true);
  });

  it("answers declined when Chrome's prompt is refused or the user declines on the card", async () => {
    const refused = shownCard(vi.fn(async () => false));
    await user().click(elements.allow);
    expect(await refused).toBe("declined");

    const requestGrant = vi.fn(async () => true);
    const declined = shownCard(requestGrant);
    await user().click(elements.decline);
    expect(await declined).toBe("declined");
    expect(requestGrant).not.toHaveBeenCalled();
  });

  it("hides and answers stopped when the step is stopped", async () => {
    const stopper = new AbortController();
    const answer = askGrantOnCard(elements, SITE, stopper.signal, vi.fn());

    stopper.abort("cancelled");

    expect(await answer).toBe("stopped");
    expect(elements.card.classList.contains("hidden")).toBe(true);
  });

  it("keeps the next card on screen when Chrome answers a card already stopped", async () => {
    const chrome = Promise.withResolvers<boolean>();
    const stopper = new AbortController();
    const first = shownCard(() => chrome.promise, stopper.signal);
    await user().click(elements.allow);
    stopper.abort("cancelled");
    expect(await first).toBe("stopped");

    void shownCard(vi.fn(async () => true));
    chrome.resolve(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(elements.card.classList.contains("hidden")).toBe(false);
  });
});
