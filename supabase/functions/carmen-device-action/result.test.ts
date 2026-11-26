import { assertEquals } from "jsr:@std/assert@1";
import { DEVICE_TOOL_NAMES } from "../_shared/carmen/device/contract.ts";
import {
  PAGE_ELEMENT_FIELD_MAX,
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
  RESULT_FIELD_MAX,
} from "../_shared/carmen/device/results.ts";
import { pageLocation, toolResult } from "./result.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const COLLEAGUE = "22222222-2222-4222-8222-222222222222";
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
  browser_screenshot: { ...PAGE, storage_path: `${ME}/1764150000000-shot.jpg` },
};

Deno.test("toolResult", async (t) => {
  await t.step("accepts each tool's result at its limits", () => {
    assertEquals(Object.keys(FULL), [...DEVICE_TOOL_NAMES]);
    for (const tool of DEVICE_TOOL_NAMES) {
      assertEquals(toolResult(tool, FULL[tool], ME), FULL[tool]);
    }
  });

  await t.step("refuses a result of another tool or of no device tool", () => {
    assertEquals(toolResult("browser_click", FULL.browser_read_page, ME), null);
    assertEquals(toolResult("browser_read_page", FULL.browser_click, ME), null);
    assertEquals(toolResult("send_whatsapp", PAGE, ME), null);
  });

  await t.step("refuses typed text or a field value on any tool", () => {
    for (const tool of DEVICE_TOOL_NAMES) {
      const result = { ...FULL[tool], typed: "secret" };

      assertEquals(toolResult(tool, result, ME), null);
    }
    for (const field of ["text", "value"]) {
      const result = { ...PAGE, [field]: "secret" };

      assertEquals(toolResult("browser_type", result, ME), null);
    }
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
      assertEquals(toolResult("browser_read_page", result, ME), null);
    }
  });

  await t.step("refuses text the database cannot store", () => {
    const page = FULL.browser_read_page;
    const halfEmoji = "\ud83d";
    const unstorable = [
      { ...page, text: `cut here ${halfEmoji}` },
      { ...page, text: "\udc00 starts low" },
      { ...page, text: "a\u0000b" },
      { ...page, title: "a\u0000b" },
      { ...page, snapshot_id: halfEmoji },
      { ...page, elements: [{ ...ELEMENT, name: halfEmoji }] },
      { ...page, path: `/a${halfEmoji}` },
      { ...page, path: "/a\u0000b" },
    ];

    const whole = { ...page, title: "whole 😀" };

    assertEquals(toolResult("browser_read_page", whole, ME), whole);
    for (const result of unstorable) {
      assertEquals(toolResult("browser_read_page", result, ME), null);
    }
  });

  await t.step("a picture's path is in the action's own user's folder", () => {
    const shot = FULL.browser_screenshot;
    const elsewhere = [
      `${COLLEAGUE}/shot.jpg`,
      `${ME}/../${COLLEAGUE}/shot.jpg`,
      `${ME}/..`,
      `${ME}/`,
      `${ME}/a/shot.jpg`,
      `${ME}/shot.jpg?download=1`,
      `${ME}/shot 1.jpg`,
      `/${ME}/shot.jpg`,
      `${ME}shot.jpg`,
      "shot.jpg",
      "",
      `${ME}/${"s".repeat(RESULT_FIELD_MAX)}`,
      7,
    ];

    assertEquals(toolResult("browser_screenshot", shot, COLLEAGUE), null);
    for (const storage_path of elsewhere) {
      const result = { ...shot, storage_path };

      assertEquals(toolResult("browser_screenshot", result, ME), null);
    }
  });

  await t.step("refuses what is not an object", () => {
    for (const result of [null, undefined, "x", 1, [PAGE]]) {
      assertEquals(toolResult("browser_click", result, ME), null);
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
      "wss://example.com",
      "ftp://example.com",
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

  await t.step("accepts a path as a URL parser writes it", () => {
    const paths = ["/", "/a/", "/a%20b", "/%D7%A2%D7%9E%D7%95%D7%93", "/a.b~c"];

    for (const path of paths) {
      assertEquals(pageLocation({ origin: PAGE.origin, path })?.path, path);
    }
  });

  await t.step("refuses a path that could name another address", () => {
    const paths = ["//evil.example/x", "/a/../b", "/a\\b", "/a b", "/עמוד"];

    for (const path of paths) {
      assertEquals(pageLocation({ origin: PAGE.origin, path }), null);
    }
  });
});
