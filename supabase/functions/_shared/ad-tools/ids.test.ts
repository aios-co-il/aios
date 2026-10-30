import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  googleCustomerVariants,
  isNumericId,
  metaAccountVariants,
} from "./ids.ts";

Deno.test("metaAccountVariants: both spellings, digits only", () => {
  assertEquals(metaAccountVariants("123"), ["123", "act_123"]);
  assertEquals(metaAccountVariants("act_123"), ["123", "act_123"]);
  assertStrictEquals(metaAccountVariants("act_1/campaigns"), null);
  assertStrictEquals(metaAccountVariants(null), null);
  assertStrictEquals(metaAccountVariants(""), null);
});

Deno.test("googleCustomerVariants: dashed and plain", () => {
  assertEquals(googleCustomerVariants("123-456-7890"), [
    "1234567890",
    "123-456-7890",
  ]);
  assertEquals(googleCustomerVariants("1234567890"), [
    "1234567890",
    "123-456-7890",
  ]);
  assertEquals(googleCustomerVariants("12345"), ["12345"]);
  assertStrictEquals(googleCustomerVariants("12,3"), null);
  assertStrictEquals(googleCustomerVariants(undefined), null);
});

Deno.test("isNumericId", () => {
  assertStrictEquals(isNumericId("120210"), true);
  assertStrictEquals(isNumericId(120210), true);
  assertStrictEquals(isNumericId("act_1"), false);
  assertStrictEquals(isNumericId("1 OR 1=1"), false);
});
