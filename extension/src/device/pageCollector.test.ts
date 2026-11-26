// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { collectPage, readCollectedPage } from "./pageCollector.ts";

const LIMITS = { textBudget: 10_000, elementsMax: 150, nameBudget: 400 };
const SECRET = "hunter2-secret";

/** Puts markup in the page and sets the values a user would have typed. */
function pageWith(html: string): void {
  document.body.innerHTML = html;
  for (const field of document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input, textarea")) {
    field.value = SECRET;
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("collectPage", () => {
  it("returns the visible text and never a field's value or an editable region", () => {
    pageWith(`
      <h1>Checkout</h1>
      <label for="pw">Password</label><input id="pw" type="password">
      <label>Card <input name="cc-number" autocomplete="cc-number"></label>
      <input name="otp" placeholder="Code">
      <textarea>${SECRET} default</textarea>
      <select><option>${SECRET} option</option></select>
      <div contenteditable="true">${SECRET} draft</div>
      <script>var s = "${SECRET}";</script><style>.x{content:"${SECRET}"}</style>
      <p>Total 10</p>
    `);

    const page = collectPage(LIMITS);

    expect(JSON.stringify(page)).not.toContain(SECRET);
    expect(page.text).toContain("Checkout");
    expect(page.text).toContain("Total 10");
  });

  it("skips hidden text", () => {
    pageWith(`<p>shown</p><p hidden>tucked away</p>`);

    expect(collectPage(LIMITS).text).not.toContain("tucked away");
  });

  it("lists actionable elements named by their labels, never by a value", () => {
    pageWith(`
      <a href="/cart">Cart</a>
      <button aria-label="Close dialog">x</button>
      <label for="email">Email</label><input id="email" type="email">
      <input type="password" aria-label="Password">
      <input type="checkbox" title="Remember me">
      <textarea placeholder="Message"></textarea>
      <input type="hidden" name="csrf">
    `);

    expect(collectPage(LIMITS).elements).toEqual([
      { role: "link", name: "Cart" },
      { role: "button", name: "Close dialog" },
      { role: "textbox", name: "Email" },
      { role: "textbox", name: "Password" },
      { role: "checkbox", name: "Remember me" },
      { role: "textbox", name: "Message" },
    ]);
  });

  it("stops at its budgets", () => {
    pageWith(`${"<p>word</p>".repeat(50)}${'<a href="/x">x</a>'.repeat(20)}`);

    const page = collectPage({ textBudget: 20, elementsMax: 3, nameBudget: 1 });

    expect(page.text.length).toBeLessThan(30);
    expect(page.elements).toEqual([
      { role: "link", name: "x" },
      { role: "link", name: "x" },
      { role: "link", name: "x" },
    ]);
  });
});

describe("readCollectedPage", () => {
  it("accepts the collector's shape and nothing else", () => {
    expect(
      readCollectedPage({
        text: "t",
        elements: [{ role: "link", name: "n", x: 1 }],
      }),
    ).toEqual({
      text: "t",
      elements: [{ role: "link", name: "n" }],
    });
    for (const value of [
      null,
      "t",
      { text: 1, elements: [] },
      { text: "t" },
      { text: "t", elements: [{ role: 1 }] },
    ]) {
      expect(readCollectedPage(value)).toBeNull();
    }
  });
});
