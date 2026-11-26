// @vitest-environment happy-dom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askGrantOnCard, type GrantCardElements } from "./grantCard.ts";

const SITE = { host: "shop.example", pattern: "https://shop.example/*" };

let elements: GrantCardElements;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="card" class="hidden"><div id="title"></div>
      <button id="allow">allow</button><button id="decline">decline</button></div>`;
  elements = {
    card: document.getElementById("card") as HTMLElement,
    title: document.getElementById("title") as HTMLElement,
    allow: document.getElementById("allow") as HTMLButtonElement,
    decline: document.getElementById("decline") as HTMLButtonElement,
  };
});

/** Shows the card; the test waits for its buttons to wake before tapping. */
function shownCard(requestGrant: (pattern: string) => Promise<boolean>) {
  return askGrantOnCard(
    elements,
    SITE,
    new AbortController().signal,
    requestGrant,
  );
}

describe("askGrantOnCard", () => {
  it("names the site and keeps its buttons asleep at first", () => {
    askGrantOnCard(elements, SITE, new AbortController().signal, vi.fn());

    expect(elements.card.classList.contains("hidden")).toBe(false);
    expect(elements.title.textContent).toContain("shop.example");
    expect(elements.allow.disabled).toBe(true);
  });

  it("asks Chrome for the site from the tap and answers with Chrome's grant", async () => {
    const requestGrant = vi.fn(async () => true);
    const answer = shownCard(requestGrant);
    await new Promise((resolve) => setTimeout(resolve, 600));

    await userEvent.setup().click(elements.allow);

    expect(requestGrant).toHaveBeenCalledWith(SITE.pattern);
    expect(await answer).toBe("allowed");
    expect(elements.card.classList.contains("hidden")).toBe(true);
  });

  it("answers declined when Chrome's prompt is refused or the user declines on the card", async () => {
    const refused = shownCard(vi.fn(async () => false));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.setup().click(elements.allow);
    expect(await refused).toBe("declined");

    const requestGrant = vi.fn(async () => true);
    const declined = shownCard(requestGrant);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.setup().click(elements.decline);
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
});
