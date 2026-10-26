import { assertNotStrictEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { normalizePhone, phoneMatchKey } from "./phone.ts";

Deno.test("normalizePhone handles Israeli formats", () => {
  assertStrictEquals(normalizePhone("+972-50-123-4567"), "0501234567");
  assertStrictEquals(normalizePhone("501234567"), "0501234567");
  assertStrictEquals(normalizePhone("050 123 4567"), "0501234567");
  assertStrictEquals(normalizePhone(""), null);
  assertStrictEquals(normalizePhone(null), null);
});

// Same cases as the SQL public.phone_match_key, which must agree.
Deno.test("phoneMatchKey ignores formatting and country code", () => {
  for (const p of [
    "052-987-6543",
    "+972 52 987 6543",
    "972529876543",
    "529876543",
  ])
    assertStrictEquals(phoneMatchKey(p), "529876543", p);
  for (const p of ["03-555-1234", "+972-3-555-1234", "035551234"])
    assertStrictEquals(phoneMatchKey(p), "035551234", p);
  assertStrictEquals(phoneMatchKey("123"), null);
  assertStrictEquals(phoneMatchKey("9721234"), null);
  assertNotStrictEquals(phoneMatchKey("052-987-6544"), "529876543");
});
