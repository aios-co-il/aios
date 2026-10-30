import { assertStrictEquals } from "jsr:@std/assert@1";
import { errorMessage } from "./error-message.ts";

Deno.test(
  "errorMessage reads message from errors and error-like objects",
  () => {
    assertStrictEquals(errorMessage(new Error("boom")), "boom");
    assertStrictEquals(errorMessage({ message: "postgrest" }), "postgrest");
    assertStrictEquals(errorMessage({ message: 42 }), "42");
  },
);

Deno.test("errorMessage is undefined without a message", () => {
  for (const value of [
    { code: "x" },
    { message: null },
    "text",
    ["boom"],
    null,
  ]) {
    assertStrictEquals(errorMessage(value), undefined);
  }
});
