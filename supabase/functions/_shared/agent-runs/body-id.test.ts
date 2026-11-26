import { assertStrictEquals } from "jsr:@std/assert@1";

import { bodyUuid } from "./body-id.ts";

const ID = "11111111-1111-4111-8111-111111111111";

Deno.test("bodyUuid", async (t) => {
  await t.step("reads a hyphenated uuid string as itself", () => {
    assertStrictEquals(bodyUuid(ID), ID);
  });

  for (const [what, value] of [
    ["an array holding the id", [ID]],
    ["the id without hyphens", ID.replaceAll("-", "")],
    ["the id in braces", `{${ID}}`],
    ["the id with a space around it", ` ${ID}`],
    ["an object", { id: ID }],
    ["a number", 7],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ] as const) {
    await t.step(`reads ${what} as no id`, () => {
      assertStrictEquals(bodyUuid(value), null);
    });
  }
});
