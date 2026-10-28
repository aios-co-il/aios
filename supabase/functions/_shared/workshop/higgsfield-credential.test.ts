import { assertStrictEquals } from "jsr:@std/assert@1";
import { higgsfieldCredential } from "./higgsfield-credential.ts";

const copied = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:secret-part";

Deno.test(
  "a copied id:secret is sent as-is even when the id field is also filled",
  () => {
    assertStrictEquals(
      higgsfieldCredential("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", copied),
      copied,
    );
    assertStrictEquals(higgsfieldCredential("other-id", copied), copied);
    assertStrictEquals(higgsfieldCredential("", copied), copied);
  },
);

Deno.test("two separate parts are still joined", () => {
  assertStrictEquals(higgsfieldCredential("a", "b"), "a:b");
  assertStrictEquals(higgsfieldCredential("  a  ", "  b  "), "a:b");
});

Deno.test("one side without a colon is not a credential", () => {
  assertStrictEquals(higgsfieldCredential("a", ""), "");
  assertStrictEquals(higgsfieldCredential("", "b"), "");
  assertStrictEquals(higgsfieldCredential("  ", "  "), "");
});

Deno.test("the whole key stored in the id field is sent as-is", () => {
  assertStrictEquals(higgsfieldCredential(copied, ""), copied);
  assertStrictEquals(higgsfieldCredential(copied, "plain-secret"), copied);
});
