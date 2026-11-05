import { assertEquals } from "jsr:@std/assert@1";
import { isEmailAddress, splitContacts } from "./email-address.ts";

Deno.test("isEmailAddress accepts plain addresses only", () => {
  assertEquals(isEmailAddress("dana@example.co.il"), true);
  assertEquals(isEmailAddress("not-an@email"), false);
  assertEquals(isEmailAddress("Dana <dana@example.com>"), false);
});

Deno.test("splitContacts splits on separators and dedupes", () => {
  assertEquals(splitContacts(" a@x.com, b@x.com;a@x.com\n0501234567 "), [
    "a@x.com",
    "b@x.com",
    "0501234567",
  ]);
  assertEquals(splitContacts(""), []);
});
