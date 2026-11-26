import { assertEquals } from "jsr:@std/assert@1";
import { DEVICE_TOOL_NAMES } from "../_shared/carmen/device/contract.ts";
import {
  PAGE_ELEMENT_FIELD_MAX,
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
  RESULT_FIELD_MAX,
} from "../_shared/carmen/device/results.ts";
import { pageLocation, toolResult } from "./result.ts";

const PAGE = { origin: "https://example.com", path: "/a/b" };
const ELEMENT = { ref: "e1", role: "button", name: "Buy" };
const FULL = {
  browser_read_page: {
    ...PAGE,
    snapshot_id: "s1",
    title: "T",
    elements: Array(READ_PAGE_ELEMENTS_MAX).fill(ELEMENT),
    text: "x".repeat(READ_PAGE_TEXT_MAX),
  },
  browser_navigate: { ...PAGE, title: "T" },
  browser_click: PAGE,
  browser_type: PAGE,
  browser_screenshot: { ...PAGE, storage_path: "user/shot.jpg" },
};

Deno.test("toolResult", async (t) => {
  await t.step("accepts each tool's result at its limits", () => {
    assertEquals(Object.keys(FULL), [...DEVICE_TOOL_NAMES]);
    for (const tool of DEVICE_TOOL_NAMES) {
      assertEquals(toolResult(tool, FULL[tool]), FULL[tool]);
    }
  });

  await t.step("refuses a result of another tool or of no device tool", () => {
    assertEquals(toolResult("browser_click", FULL.browser_read_page), null);
    assertEquals(toolResult("browser_read_page", FULL.browser_click), null);
    assertEquals(toolResult("send_whatsapp", PAGE), null);
  });

  await t.step("refuses typed text or a field value on any tool", () => {
    for (const tool of DEVICE_TOOL_NAMES) {
      assertEquals(toolResult(tool, { ...FULL[tool], typed: "secret" }), null);
    }
    assertEquals(toolResult("browser_type", { ...PAGE, text: "secret" }), null);
    assertEquals(toolResult("browser_type", { ...PAGE, value: "x" }), null);
  });

  await t.step("refuses anything over a limit", () => {
    const page = FULL.browser_read_page;
    const longName = "n".repeat(PAGE_ELEMENT_FIELD_MAX + 1);
    const over = [
      { ...page, text: page.text + "x" },
      { ...page, elements: [...page.elements, ELEMENT] },
      { ...page, elements: [{ ...ELEMENT, name: longName }] },
      { ...page, elements: [{ ...ELEMENT, value: "x" }] },
      { ...page, elements: ["e1"] },
      { ...page, title: "t".repeat(RESULT_FIELD_MAX + 1) },
      { ...page, title: 7 },
    ];

    for (const result of over) {
      assertEquals(toolResult("browser_read_page", result), null);
    }
  });

  await t.step("refuses what is not an object", () => {
    for (const result of [null, undefined, "x", 1, [PAGE]]) {
      assertEquals(toolResult("browser_click", result), null);
    }
  });
});

Deno.test("pageLocation", async (t) => {
  await t.step("accepts a web origin and a path", () => {
    assertEquals(pageLocation(PAGE), PAGE);
    assertEquals(pageLocation({ origin: "http://localhost:3000", path: "/" }), {
      origin: "http://localhost:3000",
      path: "/",
    });
  });

  await t.step("refuses an origin that is more or less than one", () => {
    const origins = [
      "https://example.com/",
      "https://example.com/a",
      "https://user:pw@example.com",
      "HTTPS://EXAMPLE.COM",
      "example.com",
      "chrome://settings",
      "file:///etc/passwd",
      "",
    ];

    for (const origin of origins) {
      assertEquals(pageLocation({ origin, path: "/" }), null);
    }
  });

  await t.step("refuses a path with a query, a fragment or no slash", () => {
    const long = "/" + "p".repeat(RESULT_FIELD_MAX);

    for (const path of ["/a?token=1", "/a#frag", "a", "", long]) {
      assertEquals(pageLocation({ origin: PAGE.origin, path }), null);
    }
  });
});
