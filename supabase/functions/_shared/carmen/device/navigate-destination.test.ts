import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { navigateDestination } from "./navigate-destination.ts";
import { RESULT_FIELD_MAX } from "./results.ts";

Deno.test("navigateDestination", async (t) => {
  await t.step("an http or https address, as the parser writes it", () => {
    assertEquals(
      navigateDestination({ url: "https://Shop.Example/a?b=1#c" }),
      "https://shop.example/a?b=1#c",
    );
    assertEquals(
      navigateDestination({ url: "http://xn--jebcwe.example/" }),
      "http://xn--jebcwe.example/",
    );
    assertEquals(
      navigateDestination({ url: "https://קרמן.example/" }),
      "https://xn--jebcwe.example/",
    );
  });

  const refused: Array<[string, unknown]> = [
    ["javascript:", { url: "javascript:alert(1)" }],
    ["data:", { url: "data:text/html,x" }],
    ["blob:", { url: "blob:https://shop.example/1" }],
    ["file:", { url: "file:///etc/passwd" }],
    ["chrome-extension:", { url: "chrome-extension://abc/x.html" }],
    ["a user name", { url: "https://aios.co.il@evil.example/" }],
    ["a password", { url: "https://:secret@shop.example/" }],
    ["relative", { url: "shop.example" }],
    [
      "over the limit",
      { url: `https://a.example/${"x".repeat(RESULT_FIELD_MAX)}` },
    ],
    ["no url", {}],
    ["an extra field", { url: "https://shop.example/", other: "x" }],
    ["not text", { url: 5 }],
    ["not an object", "https://shop.example/"],
    ["an array", ["https://shop.example/"]],
    ["null", null],
  ];
  for (const [name, args] of refused) {
    await t.step(`not ${name}`, () => {
      assertStrictEquals(navigateDestination(args), null);
    });
  }
});
