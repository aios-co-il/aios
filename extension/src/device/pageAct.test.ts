// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACT_RULES,
  COLLECTOR_RULES,
  PAGE_INPUT_KEY,
  PAGE_SNAPSHOT_KEY,
  type PageActRequest,
  type PageTarget,
} from "./keptSnapshot.ts";
import { actOnPage } from "./pageAct.ts";
import { collectPage } from "./pageCollector.ts";
import { installPageInput } from "./pageInput.ts";

const LIMITS = {
  textBudget: 10_000,
  elementsMax: 150,
  nameBudget: 400,
  snapshotKey: PAGE_SNAPSHOT_KEY,
  rules: COLLECTOR_RULES,
};
const SECRET = "typed-before-secret";

/** The element the page reports at a point; by default whatever the test put there. */
let topmost: (x: number, y: number) => Element | null;

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 10, 100, 20),
  );
  Element.prototype.scrollIntoView = vi.fn();
  document.elementFromPoint = (x, y) => topmost(x, y);
  installPageInput(PAGE_INPUT_KEY);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** Puts the markup in the page, reads it as `snapshot-1`, and makes element `ref` the topmost at its centre. */
function readPage(html: string, ref: number): Element {
  document.body.innerHTML = html;
  collectPage(LIMITS, "snapshot-1");
  const element = document.body.querySelectorAll(COLLECTOR_RULES.actionable)[
    ref
  ];
  topmost = () => element;
  return element;
}

/** The page's first element with this tag. */
function byTag(tag: string): Element {
  const found = document.querySelector(tag);
  if (!found) {
    throw new Error(`the page has no ${tag}`);
  }
  return found;
}

/** One run of the acting function on element `index`. */
function act(
  index: number,
  tool: PageActRequest["tool"],
  extra: Partial<PageActRequest> = {},
) {
  return actOnPage({
    snapshotKey: PAGE_SNAPSHOT_KEY,
    inputKey: PAGE_INPUT_KEY,
    snapshotId: "snapshot-1",
    index,
    tool,
    rules: ACT_RULES,
    ...extra,
  });
}

/** The target the function describes before the card. */
function inspect(index: number, tool: PageActRequest["tool"]): PageTarget {
  const answer = act(index, tool);
  if (answer.kind !== "target") {
    throw new Error(`no target: ${JSON.stringify(answer)}`);
  }
  return answer.target;
}

const FORM = `
  <form action="/submit">
    <label for="name">Full name</label><input id="name" name="full_name">
    <label for="pw">Password</label><input id="pw" type="password">
    <button type="submit">Send</button>
  </form>`;

describe("actOnPage before the card", () => {
  it("describes the read's element without its value: name, field facts, the form's address", () => {
    const field = readPage(FORM, 0);
    (field as HTMLInputElement).value = SECRET;

    const target = inspect(0, "browser_type");

    expect(target).toMatchObject({
      role: "textbox",
      name: "Full name",
      textEntry: true,
    });
    expect(target.pageFields.map((facts) => facts.type)).toContain("password");
    expect(JSON.stringify(target)).not.toContain(SECRET);
    topmost = () => byTag("button");
    expect(inspect(2, "browser_click").destination).toBe(
      `${location.origin}/submit`,
    );
  });

  it("finds nothing under another snapshot's id, or a position the read did not list", () => {
    readPage(FORM, 0);

    expect(act(0, "browser_click", { snapshotId: "snapshot-0" })).toEqual({
      kind: "changed",
      reason: "gone",
    });
    expect(act(40, "browser_click")).toMatchObject({ reason: "gone" });
  });

  it("refuses an element the page removed, renamed, hid or covered", () => {
    const field = readPage(FORM, 0);
    const label = byTag("label");
    label.textContent = "Delete account";
    expect(act(0, "browser_type")).toMatchObject({ reason: "renamed" });

    label.textContent = "Full name";
    topmost = () => document.body;
    expect(act(0, "browser_type")).toMatchObject({ reason: "covered" });

    topmost = () => field;
    field.setAttribute("hidden", "");
    expect(act(0, "browser_type")).toMatchObject({ reason: "hidden" });

    field.remove();
    expect(act(0, "browser_type")).toMatchObject({ reason: "detached" });
  });
});

describe("actOnPage against a page that names things like the panel's", () => {
  it("never takes an element with the snapshot's id for the snapshot", () => {
    document.body.innerHTML = `<div id="${PAGE_SNAPSHOT_KEY}"></div><button>Go</button>`;
    Reflect.deleteProperty(globalThis, PAGE_SNAPSHOT_KEY);
    Object.defineProperty(Window.prototype, PAGE_SNAPSHOT_KEY, {
      configurable: true,
      get: () => ({
        id: "snapshot-1",
        elements: [document.body],
        described: [],
      }),
    });

    try {
      expect(act(0, "browser_click")).toEqual({
        kind: "changed",
        reason: "gone",
      });
    } finally {
      Reflect.deleteProperty(Window.prototype, PAGE_SNAPSHOT_KEY);
    }
  });

  it('shows the form\'s real address when a field is named "action"', () => {
    readPage(
      `<form action="/real"><input name="action"><button type="submit">Pay</button></form>`,
      1,
    );
    topmost = () => byTag("button");

    expect(inspect(1, "browser_click").destination).toBe(
      `${location.origin}/real`,
    );
  });
});

describe("actOnPage after the tap", () => {
  it("types through the setter and tells the page, without reading what was there", () => {
    const field = readPage(FORM, 0) as HTMLInputElement;
    field.value = SECRET;
    const events: Array<string> = [];
    for (const type of ["input", "change"]) {
      field.addEventListener(type, () => events.push(type));
    }
    const { fingerprint } = inspect(0, "browser_type");

    const answer = act(0, "browser_type", {
      expected: fingerprint,
      text: "Dana Levi",
    });

    expect(answer).toEqual({ kind: "acted" });
    expect(field.value).toBe("Dana Levi");
    expect(events).toEqual(["input", "change"]);
  });

  it("clicks the topmost element at the centre with a tap's events", () => {
    readPage(FORM, 2);
    const button = byTag("button");
    const events: Array<string> = [];
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      button.addEventListener(type, (event) => {
        event.preventDefault();
        events.push(type);
      });
    }
    const { fingerprint } = inspect(2, "browser_click");

    expect(act(2, "browser_click", { expected: fingerprint })).toEqual({
      kind: "acted",
    });
    expect(events).toEqual(["pointerdown", "mousedown", "mouseup", "click"]);
  });

  it("does nothing when anything the card was drawn from changed", () => {
    const field = readPage(FORM, 0) as HTMLInputElement;
    const { fingerprint } = inspect(0, "browser_type");
    field.setAttribute("autocomplete", "cc-number");

    expect(
      act(0, "browser_type", { expected: fingerprint, text: "4111" }),
    ).toEqual({ kind: "changed", reason: "moved" });
    expect(field.value).toBe("");
  });

  it("types into nothing but a text field", () => {
    readPage(FORM, 2);
    const { fingerprint } = inspect(2, "browser_type");

    expect(
      act(2, "browser_type", { expected: fingerprint, text: "x" }),
    ).toEqual({ kind: "changed", reason: "not_text" });
  });

  it("does nothing on a new document, which holds no snapshot", () => {
    readPage(FORM, 2);
    const { fingerprint } = inspect(2, "browser_click");
    Reflect.deleteProperty(globalThis, PAGE_SNAPSHOT_KEY);

    expect(act(2, "browser_click", { expected: fingerprint })).toEqual({
      kind: "changed",
      reason: "gone",
    });
  });
});
