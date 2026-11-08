import { assertEquals } from "jsr:@std/assert@1";
import { toAddressGender } from "./address-gender.ts";

Deno.test("male and female are kept and anything else is unknown", () => {
  assertEquals(toAddressGender("male"), "male");
  assertEquals(toAddressGender("female"), "female");
  assertEquals(toAddressGender("other"), null);
  assertEquals(toAddressGender(null), null);
});
