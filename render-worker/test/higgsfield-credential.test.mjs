import assert from "node:assert/strict";
import { test } from "node:test";
import { higgsfieldCredential } from "../src/providers/higgsfield-credential.mjs";

const copied = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:secret-part";

test("a copied id:secret is sent as-is even when the id field is also filled", () => {
  assert.equal(
    higgsfieldCredential("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", copied),
    copied,
  );
  assert.equal(higgsfieldCredential("other-id", copied), copied);
  assert.equal(higgsfieldCredential("", copied), copied);
});

test("two separate parts are still joined", () => {
  assert.equal(higgsfieldCredential("a", "b"), "a:b");
});

test("one side without a colon is not a credential", () => {
  assert.equal(higgsfieldCredential("a", ""), "");
  assert.equal(higgsfieldCredential("", "b"), "");
});
